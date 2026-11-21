import "server-only";

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./locales";
import { zhCN } from "./messages/zh-CN";
import { createTranslator, type Messages, type Translator } from "./translate";

/* ---------------------------------------------------------------------------
   The locale on the server.

   The visitor's own choice (the cookie the language menu writes) wins; with
   none, the browser's Accept-Language decides, so a reader in China lands on
   Chinese without looking for the switch. Reading either makes the page
   render per request — the cost of serving HTML in the reader's language
   rather than flashing English first.

   The dictionaries are imported here and only here, so a client bundle never
   carries one: the root layout passes the reader's own to the provider.
--------------------------------------------------------------------------- */

const MESSAGES: Record<Locale, Messages | null> = {
  en: null,
  "zh-CN": zhCN,
};

export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language"));
}

export function messagesFor(locale: Locale): Messages | null {
  return MESSAGES[locale];
}

export async function getTranslator(): Promise<Translator> {
  const locale = await getLocale();
  return createTranslator(locale, messagesFor(locale));
}

/** A route's title and description in the reader's language: "Events · Elyra". */
export async function pageMetadata(title: string, description: string): Promise<Metadata> {
  const t = await getTranslator();
  return { title: `${t(title)} · Elyra`, description: t(description) };
}
