"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createFormat, type Format } from "./format";
import type { MessageKey, Messages, T } from "./messages";
import { createT } from "./translate";

interface I18n {
  locale: Locale;
  t: T;
  format: Format;
}

const Ctx = createContext<I18n | null>(null);

/** Set once by the root layout with the request's language and its dictionary only. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const t = createT<MessageKey>(locale, messages);
    return { locale, t, format: createFormat(locale, t) };
  }, [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}

export const useT = () => useI18n().t;
export const useFormat = () => useI18n().format;
export const useLocale = () => useI18n().locale;
