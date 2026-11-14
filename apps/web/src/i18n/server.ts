import "server-only";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { sessionUser } from "@/lib/auth";
import { LOCALE_COOKIE, negotiate, parseLocale, type Locale } from "./config";
import { createFormat } from "./format";
import { MESSAGES, type MessageKey, type T } from "./messages";
import { createT } from "./translate";

/** Interface language of this request: the account's choice, then this browser's, then its headers. */
export const getLocale = cache(async (): Promise<Locale> => {
  const user = await sessionUser();
  if (user?.locale) return user.locale;
  const fromCookie = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return negotiate((await headers()).get("accept-language"));
});

/**
 * Remembers the language in this browser for a year (the login page keeps it after logout) and
 * re-renders every page in it. Server actions only.
 */
export async function rememberLocale(locale: Locale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export const getMessages = cache(async () => MESSAGES[await getLocale()]);

export const getT = cache(async (): Promise<T> => {
  const locale = await getLocale();
  return createT<MessageKey>(locale, MESSAGES[locale]);
});

export const getFormat = cache(async () => createFormat(await getLocale(), await getT()));
