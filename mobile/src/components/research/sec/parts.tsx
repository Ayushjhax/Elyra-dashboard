import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CATEGORIES, MAJOR_ITEMS, type EdgarCategory } from "@/lib/research/sec/forms";
import { Chips } from "~/components/research/parts";
import { CompanyMark, Monogram } from "~/components/ui/marks";
import { Text, type TextTone } from "~/components/ui/Text";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Pieces the SEC views share: a filer's mark (the company logo when it is
   listed, its initials when it is not), a tag chip, a filing's 8-K items,
   and the kind-of-filing filter.
--------------------------------------------------------------------------- */

export function FilerMark({ ticker, name, size = 32 }: { ticker: string | null; name: string; size?: number }) {
  return ticker ? <CompanyMark ticker={ticker} size={size} /> : <Monogram name={name} size={size} />;
}

const TONE: Record<"neutral" | "positive" | "negative" | "accent", { background: string; text: TextTone }> = {
  neutral: { background: color["surface-hover"], text: "secondary" },
  positive: { background: color["positive-bg"], text: "positive" },
  negative: { background: color["negative-bg"], text: "negative" },
  accent: { background: color["surface-active"], text: "primary" },
};

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONE }) {
  return (
    <View style={[styles.tag, { backgroundColor: TONE[tone].background }]}>
      <Text variant="label" tone={TONE[tone].text} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** A filing's 8-K items; the ones that tend to matter are marked. */
export function ItemTags({ items }: { items: { code: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.tags}>
      {items.slice(0, 4).map((item) => (
        <Tag key={item.code} tone={MAJOR_ITEMS.has(item.code) ? "accent" : "neutral"}>
          {item.label}
        </Tag>
      ))}
      {items.length > 4 && (
        <Text variant="label" tone="muted">
          +{items.length - 4}
        </Text>
      )}
    </View>
  );
}

export function CategoryChips({ value, onChange }: { value: EdgarCategory; onChange: (category: EdgarCategory) => void }) {
  return <Chips<EdgarCategory> label="Kind of filing" value={value} onChange={onChange} options={CATEGORIES.map((category) => ({ value: category.id, label: category.label }))} />;
}

/** "14 Oct", or "14 Oct 2025" for another year. */
export function shortDate(iso: string | null, now: number): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const sameYear = new Date(parsed).getUTCFullYear() === new Date(now).getUTCFullYear();
  return new Date(parsed).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function shares(value: number): string {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value.toLocaleString("en-US");
}

export const styles = StyleSheet.create({
  tag: { borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1, maxWidth: "100%" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" },
});
