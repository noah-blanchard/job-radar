import { intlTag, type Locale } from "./config";

/** A countable message: one form per `Intl.PluralRules` category, `other` always present. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
export type Leaf = string | Plural;
export interface Dict {
  [key: string]: Leaf | Dict;
}

/** The dictionary shape with literal types erased: what every language must provide. */
export type Widen<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends { other: string }
      ? Plural
      : Widen<T[K]>;
};

/** Every dot path to a message ("inbox.empty", "status.saved"). */
export type Paths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends { other: string }
      ? K
      : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type Params = Record<string, string | number>;

export const isPlural = (v: unknown): v is Plural =>
  typeof v === "object" && v !== null && typeof (v as Plural).other === "string";

/**
 * `t("inbox.selected", { count: 3 })`: looks the key up, picks the plural form from `count`
 * and fills `{name}` placeholders (numbers formatted for the language). A missing key renders
 * as the key itself, so a slip is visible instead of crashing the page.
 */
export function createT<K extends string>(locale: Locale, messages: Dict) {
  const tag = intlTag(locale);
  const plural = new Intl.PluralRules(tag);
  const number = new Intl.NumberFormat(tag);
  return function t(key: K, params?: Params): string {
    let node: Leaf | Dict | undefined = messages;
    for (const part of key.split(".")) {
      node = node && typeof node === "object" && !isPlural(node) ? node[part] : undefined;
    }
    let text: string;
    if (typeof node === "string") text = node;
    else if (isPlural(node)) {
      const n = Number(params?.count ?? 0);
      text = node[plural.select(n)] ?? node.other;
    } else return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, name: string) => {
      const v = params[name];
      if (v === undefined) return m;
      return typeof v === "number" ? number.format(v) : v;
    });
  };
}
