import { Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, Eye, Layers, LineChart, type LucideIcon } from "lucide-react-native";
import { exposureLine, structureLine, watchNextLine, type BriefLine } from "@/lib/market/brief";
import type { PivotLevels } from "@/lib/market/levels";
import type { PriceRow } from "@/lib/market/pyth/types";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useAlerts } from "~/lib/stores/alerts";
import { usePortfolio } from "~/lib/stores/portfolio";
import { useAppStore } from "~/lib/store";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The decision brief — the website's DecisionBrief, folded under the chart:
   price structure, your exposure in this market, and what to watch next.
   The three lines come from lib/market/brief.ts, the website's own rules;
   only the wording of where an alert goes is the app's.
--------------------------------------------------------------------------- */

const ROWS: { key: "structure" | "exposure" | "watch"; label: string; icon: LucideIcon }[] = [
  { key: "structure", label: "Price structure", icon: LineChart },
  { key: "exposure", label: "Your exposure", icon: Layers },
  { key: "watch", label: "Watch next", icon: Eye },
];

export function DecisionBrief({ symbol, row, levels }: { symbol: string; row: PriceRow | undefined; levels: PivotLevels | null }) {
  const open = useAppStore((state) => state.decisionBriefOpen);
  const setOpen = useAppStore((state) => state.setDecisionBriefOpen);
  const auth = useElyraAuth();
  const portfolio = usePortfolio();
  const alerts = useAlerts();
  const now = useMinute();

  const lines: Record<(typeof ROWS)[number]["key"], BriefLine> = {
    structure: structureLine(symbol, row, levels, now),
    exposure: exposureLine(
      symbol,
      {
        available: auth.available,
        ready: auth.ready,
        authenticated: auth.authenticated,
        snapshot: portfolio.snapshot,
        loading: portfolio.loading,
        error: portfolio.error,
        unconfigured: portfolio.unconfigured,
        stale: portfolio.stale,
        fetchedAt: portfolio.fetchedAt,
      },
      now,
    ),
    watch: watchNextLine(symbol, row, alerts, levels, "app"),
  };

  return (
    <View accessibilityLabel="Decision brief" style={styles.card}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <Text variant="eyebrow" tone="muted">
          Decision brief
        </Text>
        <Text variant="data-sm" tone="secondary">
          {symbol}
        </Text>
        <View style={styles.flex} />
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          color={color["text-muted"]}
          style={{ transform: [{ rotate: open ? "0deg" : "-90deg" }] }}
        />
      </Pressable>
      {open &&
        ROWS.map(({ key, label, icon: Icon }) => {
          const line = lines[key];
          return (
            <View key={key} style={styles.row}>
              <Icon size={15} strokeWidth={1.5} color={color["text-muted"]} style={styles.icon} />
              <View style={styles.flex}>
                <Text variant="label" tone="secondary">
                  {label}
                </Text>
                {line.kind === "loading" ? (
                  <View style={styles.gap}>
                    <Skeleton width="80%" />
                  </View>
                ) : line.kind === "unavailable" ? (
                  <Text variant="body-sm" tone="muted" style={styles.gap}>
                    {line.text}
                  </Text>
                ) : (
                  <>
                    <Text variant="body-sm" style={styles.gap}>
                      {line.text}
                    </Text>
                    <Text variant="data-sm" tone="muted">
                      {line.source}
                    </Text>
                  </>
                )}
              </View>
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-raised"] },
  head: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 12 },
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  icon: { marginTop: 2 },
  gap: { marginTop: 2 },
});
