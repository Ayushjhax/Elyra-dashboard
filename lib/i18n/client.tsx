"use client";

import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./locales";
import { createTranslator, type Messages, type TranslationValues, type Translator } from "./translate";

/* ---------------------------------------------------------------------------
   The locale on the client.

   The root layout reads the visitor's locale on the server and hands it here
   with its dictionary — the English site is sent no dictionary at all. Every
   component that renders text calls `useT()`, which works the same during
   the server render and in the browser, so the HTML arrives in the reader's
   language and hydrates without a mismatch.

   A locale is fixed for the life of a page: changing it writes the cookie
   and reloads, so a label computed once — in an effect, a toast, a handler —
   is never left in the old language. That is also what lets `translateNow`
   exist, for code outside render on the client: event handlers, effects and
   stores. It must never be called during render, where it would read English
   on the server.
--------------------------------------------------------------------------- */

interface I18nValue {
  locale: Locale;
  messages: Messages | null;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, messages: null });

/* The browser's copy, for `translateNow`. Written only in the browser, by
   the provider's effect — on the server this module is shared by every
   request, and effects never run there. */
let browserTranslator: Translator = createTranslator(DEFAULT_LOCALE, null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  /* A layout effect: it runs after the first commit and before any
     descendant's passive effect, so an effect or handler that reaches for
     `translateNow` already finds the reader's language. */
  useLayoutEffect(() => {
    browserTranslator = createTranslator(locale, messages);
  }, [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The translator for render: `const t = useT(); t("Connect")`. */
export function useT(): Translator {
  const { locale, messages } = useContext(I18nContext);
  return useMemo(() => createTranslator(locale, messages), [locale, messages]);
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Translation outside render, in the browser only — see the note above. */
export function translateNow(key: string, values?: TranslationValues): string {
  return browserTranslator(key, values);
}

/** The locale outside render, in the browser only. */
export function localeNow(): Locale {
  return browserTranslator.locale;
}

/** Remember the visitor's choice and reload into it. */
export function chooseLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  window.location.reload();
}
