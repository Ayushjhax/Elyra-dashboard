/* ---------------------------------------------------------------------------
   The languages the website speaks, and how a visitor's is chosen.

   Pure, so the server (which reads the cookie and Accept-Language), the
   client (which writes the cookie) and the formatters in lib/format.ts share
   one list. Adding a language is adding it here, writing its dictionary
   under lib/i18n/messages/, and nothing else.

   The locale lives in a cookie, not the URL. A `/zh-CN/...` prefix would put
   every route under `app/[lang]`, and the shell's geometry (lib/layout.ts),
   referral links and Android App Links all match on the path as it is.
--------------------------------------------------------------------------- */

export const LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Set by the language menu; read by the root layout on every request. */
export const LOCALE_COOKIE = "elyra-locale";

/** A year: the choice is the visitor's until they change it. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language named in itself, so a reader finds theirs without reading the other. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

/** The short form the header's language button shows. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  "zh-CN": "中文",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale an `Accept-Language` header asks for, among the ones we have.
 *
 * Any Chinese tag — zh, zh-CN, zh-Hans, zh-SG, and zh-TW / zh-HK too — gets
 * Simplified Chinese, the only Chinese there is; a reader of Traditional can
 * switch to English from the header. Tags are taken in q order; anything
 * unmatched is English.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const weight = q === undefined ? 1 : Number.parseFloat(q.slice(2));
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag !== "" && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of ranked) {
    if (tag === "zh" || tag.startsWith("zh-")) return "zh-CN";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}

/**
 * The locale a request reads in: the cookie the language menu writes, else
 * its Accept-Language. For route handlers, which have the raw headers.
 */
export function localeFromHeaders(cookieHeader: string | null, acceptLanguage: string | null): Locale {
  const chosen = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(chosen) ? chosen : negotiateLocale(acceptLanguage);
}

/**
 * The locale `Intl` formats dates in. English keeps the en-GB day-month order
 * the product has always used ("21 Nov"); Chinese gets "11月21日".
 */
export function intlLocale(locale: Locale): string {
  return locale === "zh-CN" ? "zh-CN" : "en-GB";
}
