import type { Locale } from "./locales";

/* ---------------------------------------------------------------------------
   Translation, as a pure function.

   The key is the English text itself: `t("Connect wallet")`. The English
   site needs no dictionary at all, a missing translation shows the English
   rather than a key, and the source still reads as the product reads.

   Interpolation is by name — `t("{count} positions", { count })` — so a
   translation can move a value to where its own grammar wants it. Plurals
   are spelled out at the call site ("1 position" / "{count} positions"):
   Chinese has none, and English has two.

   `lib/i18n/coverage.test.ts` holds every literal key in the code to a
   Chinese entry with the same placeholders.
--------------------------------------------------------------------------- */

export type Messages = Readonly<Record<string, string>>;

export type TranslationValues = Readonly<Record<string, string | number>>;

/** `t(key, values)`, carrying the locale it translates into for the formatters. */
export interface Translator {
  (key: string, values?: TranslationValues): string;
  readonly locale: Locale;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function translate(
  messages: Messages | null | undefined,
  key: string,
  values?: TranslationValues,
): string {
  const template = messages?.[key] ?? key;
  if (values === undefined) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function createTranslator(locale: Locale, messages: Messages | null | undefined): Translator {
  const t = (key: string, values?: TranslationValues) => translate(messages, key, values);
  return Object.assign(t, { locale });
}

/** The names a template interpolates, in order: "{a} of {b}" → ["a", "b"]. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/**
 * Marks English text as a key without translating it, for text defined where
 * there is no translator — a module-level list of labels — and translated
 * where it is rendered: `{ label: msg("Portfolio") }`, then `t(item.label)`.
 * It returns its argument; the coverage test reads it as a key.
 */
export function msg<const T extends string>(text: T): T {
  return text;
}

/** English, for code that formats outside any provider (tests, the server's own text). */
export const englishTranslator: Translator = createTranslator("en", null);
