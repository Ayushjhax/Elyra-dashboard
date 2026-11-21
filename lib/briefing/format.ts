import type { Locale } from "@/lib/i18n/locales";
import type { Briefing, BriefingItem } from "@/lib/briefing/types";

/* ---------------------------------------------------------------------------
   The briefing as text to post — to a channel, a group, X — in the format
   people already read daily digests in: a keycap number, the token, the
   headline, a blank line, what happened.

   The keycaps are emoji, which the brand keeps off product surfaces; the
   website draws its numbers in the brand's own figures and keeps the emoji
   for this text, which is the reader's to post. Pure.
--------------------------------------------------------------------------- */

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "\u{1F51F}"];

export function keycap(index: number): string {
  return KEYCAPS[index] ?? `${index + 1}.`;
}

/** The item's headline and body in the reader's language, English when no translation passed. */
export function itemText(item: BriefingItem, locale: Locale): { headline: string; body: string } {
  if (locale === "zh-CN" && item.headlineZh !== null && item.bodyZh !== null) return { headline: item.headlineZh, body: item.bodyZh };
  return { headline: item.headline, body: item.body };
}

/** "$SUI: Hashi launches on mainnet…" — the ticker leads when there is one. */
export function headlineLine(item: BriefingItem, locale: Locale): string {
  const { headline } = itemText(item, locale);
  const colon = locale === "zh-CN" ? "：" : ": ";
  return item.ticker === null ? headline : `$${item.ticker}${colon}${headline}`;
}

const TITLE: Record<Locale, string> = { en: "Elyra Daily Briefing", "zh-CN": "Elyra 每日简报" };
const MORE: Record<Locale, string> = {
  en: "And more: trending token moves, on-chain opportunities, market signals......",
  "zh-CN": "更多内容：热门代币异动、链上机会、市场信号……",
};
const READ: Record<Locale, string> = { en: "Read it on Elyra:", "zh-CN": "在 Elyra 阅读：" };

export function briefingDate(day: string, locale: Locale): string {
  const [year, month, date] = day.split("-").map(Number);
  if (locale === "zh-CN") return `${year}年${month}月${date}日`;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function briefingText(briefing: Briefing, locale: Locale, url: string | null = null): string {
  const lines = [`${TITLE[locale]} · ${briefingDate(briefing.day, locale)}`, ""];
  briefing.items.forEach((item, index) => {
    lines.push(`${keycap(index)} ${headlineLine(item, locale)}`, "", itemText(item, locale).body, "");
  });
  lines.push(MORE[locale]);
  if (url !== null) lines.push("", `${READ[locale]} ${url}`);
  return lines.join("\n");
}
