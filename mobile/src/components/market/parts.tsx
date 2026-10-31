import { Fragment } from "react";
import { Text as NativeText, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { formatPct } from "@/lib/format";
import { Text } from "~/components/ui/Text";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Markets tab's shared pieces, so its three views read as one section:
   the serif title, the lime main tabs, the underline sub-tabs, the filter
   chips, the change badge and the feed's state in words.

   Every colour is a brand token. Lime marks the selected control and the
   primary action only; gains and losses are Sage and Clay, and always carry
   their sign, so neither is told by colour alone.
--------------------------------------------------------------------------- */

export type FeedHealth = "live" | "stale" | "disconnected" | "loading";

const HEALTH_COLOR: Record<FeedHealth, string> = {
  live: color.positive,
  stale: color.caution,
  disconnected: color.negative,
  loading: color["text-muted"],
};

export const HEALTH_WORD: Record<FeedHealth, string> = { live: "Live", stale: "Stale", disconnected: "Disconnected", loading: "Loading" };

/** A price feed's state, from the price store's status and whether any price arrived. */
export function priceHealth(status: "live" | "error" | "loading" | string, hasRows: boolean): FeedHealth {
  if (status === "live") return "live";
  if (status === "error") return hasRows ? "stale" : "disconnected";
  return "loading";
}

/** A polled feed's state: stale once its last answer is older than `staleAfterMs`. */
export function polledHealth({
  hasData,
  failed,
  at,
  now,
  staleAfterMs,
}: {
  hasData: boolean;
  failed: boolean;
  at: string | null;
  now: number;
  staleAfterMs: number;
}): FeedHealth {
  if (!hasData) return failed ? "disconnected" : "loading";
  if (failed) return "stale";
  const age = at === null ? null : now - Date.parse(at);
  return age !== null && age > staleAfterMs ? "stale" : "live";
}

/** The serif section title. Scales with the phone; capped so it never crowds the tabs. */
export function MarketsTitle() {
  const { width } = useWindowDimensions();
  const size = Math.min(52, Math.max(40, Math.round(width * 0.118)));
  return (
    <NativeText
      accessibilityRole="header"
      maxFontSizeMultiplier={1.2}
      style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.12) }]}
    >
      Markets
    </NativeText>
  );
}

export interface Tab<T extends string> {
  value: T;
  label: string;
}

/** The main view switch: the selected segment is lime-filled with dark text. */
export function MarketsTabs<T extends string>({
  tabs,
  value,
  onChange,
  accessibilityLabel,
}: {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const selectedIndex = tabs.findIndex((tab) => tab.value === value);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.tabs}>
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        /* A hairline between two unselected neighbours, as in the design. */
        const rule = index > 0 && index !== selectedIndex && index - 1 !== selectedIndex;
        return (
          <Fragment key={tab.value}>
            {rule && <View style={styles.tabRule} />}
            <Pressable
              onPress={() => {
                if (selected) return;
                void Haptics.selectionAsync();
                onChange(tab.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.tab, selected && styles.tabOn, pressed && !selected && styles.tabPressed]}
            >
              <Text
                key={selected ? "on" : "off"}
                variant="body"
                tone={selected ? "on-accent" : "secondary"}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={styles.tabLabel}
              >
                {tab.label}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

/** A secondary switch: lime text over a thin lime underline on the selected tab. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  accessibilityLabel,
}: {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.underline}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => !selected && onChange(tab.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.underlineTab, selected && styles.underlineTabOn, pressed && { opacity: 0.7 }]}
          >
            <Text variant="body" tone={selected ? "accent" : "secondary"} maxFontSizeMultiplier={1.3} style={styles.tabLabel}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Filter pills. By default one row that scrolls sideways on a narrow phone
 * rather than wrapping; `wrap` lets a longer set flow onto a second line.
 */
export function FilterChips<T extends string>({
  chips,
  value,
  onChange,
  accessibilityLabel,
  wrap = false,
}: {
  chips: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  wrap?: boolean;
}) {
  const pills = chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            onPress={() => !selected && onChange(chip.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && !selected && styles.tabPressed]}
          >
            <Text variant="body" tone={selected ? "on-accent" : "secondary"} maxFontSizeMultiplier={1.3} style={styles.chipLabel}>
              {chip.label}
            </Text>
          </Pressable>
        );
  });
  if (wrap) {
    return (
      <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.chips, styles.chipsWrap]}>
        {pills}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.chips}
    >
      {pills}
    </ScrollView>
  );
}

/**
 * A signed percentage on a tinted pill — Sage up, Clay down. Null is a dash
 * with its reason, never 0%.
 */
export function ChangeBadge({ pct, decimals = 2, reason }: { pct: number | null; decimals?: number; reason: string }) {
  if (pct === null) {
    return (
      <View style={[styles.badge, styles.badgeAbsent]}>
        <Text variant="data-sm" tone="muted" accessibilityLabel={`Unavailable: ${reason}`}>
          —
        </Text>
      </View>
    );
  }
  const up = pct >= 0;
  return (
    <View style={[styles.badge, { backgroundColor: up ? color["positive-bg"] : color["negative-bg"] }]}>
      <Text variant="data" tone={up ? "positive" : "negative"} maxFontSizeMultiplier={1.3}>
        {formatPct(pct, { decimals })}
      </Text>
    </View>
  );
}

/** The feed's state as a dot and a word — the word, so it is not told by colour alone. */
export function HealthTag({ health, upper = false }: { health: FeedHealth; upper?: boolean }) {
  return (
    <View style={styles.health} accessibilityLabel={`Feed ${HEALTH_WORD[health].toLowerCase()}`}>
      <View style={[styles.dot, { backgroundColor: HEALTH_COLOR[health] }]} />
      <Text variant={upper ? "eyebrow" : "label"} tone={health === "disconnected" ? "negative" : upper ? "primary" : "secondary"}>
        {HEALTH_WORD[health]}
      </Text>
    </View>
  );
}

/** An uppercase section label with the feed state beside it. */
export function SectionLabel({ label, health, right }: { label: string; health?: FeedHealth; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionLabel}>
      <Text variant="eyebrow" tone="secondary" accessibilityRole="header">
        {label}
      </Text>
      {health !== undefined && <HealthTag health={health} upper />}
      <View style={styles.flex} />
      {right}
    </View>
  );
}

/** The shared look of a bordered list on Markets. */
export const panel = StyleSheet.create({
  box: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], letterSpacing: -0.5, paddingTop: 4 },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  tab: { flex: 1, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderRadius: radius.panel, paddingHorizontal: 8 },
  tabOn: { backgroundColor: color["accent-hover"] },
  tabPressed: { backgroundColor: color["surface-hover"] },
  tabRule: { width: 1, height: 22, backgroundColor: color["border-strong"] },
  tabLabel: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, textAlign: "center", alignSelf: "stretch" },
  underline: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  underlineTab: { flex: 1, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  underlineTabOn: { borderBottomColor: color["accent-hover"] },
  chips: { gap: 8, paddingVertical: 2 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: color["accent-hover"], borderColor: color["accent-hover"] },
  chipLabel: { fontFamily: fontFamily("sans", 500), fontSize: 15, lineHeight: 20 },
  badge: { minWidth: 72, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.control, alignItems: "center" },
  badgeAbsent: { backgroundColor: color["surface-raised"] },
  health: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  sectionLabel: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 28 },
});
