import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Eye, EyeOff } from "lucide-react-native";
import { formatAge, formatPct, formatUsd } from "@/lib/format";
import { change24h } from "@/lib/portfolio/derive";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { Button } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Money } from "~/components/ui/values";
import { Notice } from "~/components/wallet/parts";
import { useAppStore, useBalancesHidden } from "~/lib/store";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { usePortfolioHistory } from "~/lib/stores/portfolioViews";
import { useSecond } from "~/lib/useClock";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account overview — the website's OverviewStrip, and every figure the
   chat's /portfolio and the Mini App's Overview showed: the value with its
   24h move, what is available, the open PnL, how many positions are open,
   the seven-day line, and where the money sits, venue by venue.

   Nothing here is a sample. A figure that cannot be computed is a dash with
   its reason; a genuine zero reads as zero; a stale reading says so, with
   its age.
--------------------------------------------------------------------------- */

const MASK = "▒▒▒▒▒▒";

export function positionCount(snapshot: PortfolioSnapshot): number {
  return snapshot.spot.length + snapshot.perps.length + snapshot.defi.length + (snapshot.prediction.activeMarkets ?? 0);
}

/** The seven-day value, as a line. */
export function Sparkline({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = 3 + (index / Math.max(values.length - 1, 1)) * (width - 6);
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1]! >= values[0]!;
  const stroke = rising ? color.positive : color.negative;
  const lastY = height - 3 - ((values[values.length - 1]! - min) / span) * (height - 6);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color["border-subtle"]} strokeDasharray="2 6" />
      <Polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={width - 3} cy={lastY} r={3} fill={stroke} />
    </Svg>
  );
}

function Performance({ enabled, updated }: { enabled: boolean; updated: string | null }) {
  const history = usePortfolioHistory("1W");
  const hidden = useBalancesHidden();
  const [width, setWidth] = useState(240);
  const values = history.values;
  let body: React.ReactNode;
  if (hidden) body = <Text variant="label" tone="muted">Balance history hidden</Text>;
  else if (!enabled) body = <Skeleton width="100%" height={32} />;
  else if (history.loading) body = <Skeleton width="100%" height={32} />;
  else if (values.length >= 2) body = <Sparkline values={values} width={width} height={32} />;
  else body = <Text variant="label" tone="muted">{history.error ?? "No history yet"}</Text>;

  const first = values[0];
  const last = values[values.length - 1];
  const label =
    !hidden && enabled && values.length >= 2 && first !== undefined && last !== undefined
      ? `Seven days: from ${formatUsd(first)} to ${formatUsd(last)}${history.history?.basis === "reconstructed" ? ", rebuilt from prices" : ""}`
      : hidden ? "Balance history hidden" : "Seven days";
  return (
    <View accessible accessibilityLabel={label} style={styles.performance} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {!hidden && body}
      <View style={styles.caption}>
        <Text variant="label" tone="muted" style={styles.periodLabel}>
          {hidden ? "Balance history hidden" : `7-day${history.history?.basis === "reconstructed" ? " · rebuilt from prices" : ""}${history.stale ? " · last reading" : ""}`}
        </Text>
        {updated !== null && <Text variant="label" tone="muted">{updated}</Text>}
      </View>
    </View>
  );
}

function Figure({ label, explanation, children }: { label: string; explanation: string; children: React.ReactNode }) {
  return (
    <View style={styles.figure}>
      <View style={styles.figureLabel}>
        <Text variant="label" tone="secondary">{label}</Text>
        <InfoTip label={`About ${label}`} text={explanation} />
      </View>
      {children}
    </View>
  );
}

export function OverviewCard({ feed }: { feed: PortfolioFeed }) {
  const hidden = useBalancesHidden();
  const setHidden = useAppStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const snapshot = feed.snapshot;
  const change = useMemo(() => (snapshot ? change24h(snapshot) : null), [snapshot]);

  if (feed.unconfigured) {
    return (
      <View style={styles.card}>
        <Text variant="body-sm" tone="secondary">
          Balances are not configured on the server, so the portfolio can&apos;t be read.
        </Text>
      </View>
    );
  }
  if (snapshot === null && feed.error !== null && !feed.loading) {
    return (
      <View style={styles.card}>
        <View style={styles.inline}>
          <AlertTriangle size={14} strokeWidth={1.5} color={color.negative} />
          <Text variant="body-sm" tone="secondary" style={styles.flex}>
            Portfolio unavailable — {feed.error}
          </Text>
        </View>
        <Button label={feed.refreshing ? "Retrying…" : "Try again"} size="sm" onPress={feed.refetch} disabled={feed.refreshing} />
      </View>
    );
  }

  const summary = snapshot?.summary ?? null;
  const failed = snapshot?.notes.filter((note) => note.kind === "failed") ?? [];
  const pnlExplanation = summary?.unrealizedPnlUsd === null
    ? snapshot?.perps.length === 0
      ? "No open position has reported a PnL. Connect a venue from Account to include your perpetual positions. A dash means unavailable, not zero."
      : "The connected sources did not report an open-position PnL. A dash means unavailable, not zero."
    : "Unrealized profit or loss reported by your connected accounts. Spot PnL is included only when a cost basis is known.";

  return (
    <View accessibilityLabel="Account overview" style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="label" tone="muted">
            Portfolio value
          </Text>
          {summary === null ? (
            <Skeleton width={160} height={30} />
          ) : (
            <Money value={summary.totalValueUsd} reason="No source returned a value that could be totalled." variant="display" />
          )}
          {change !== null && (
            <View
              accessible
              accessibilityLabel={`24 hour change ${hidden ? "hidden" : formatUsd(change.pnlUsd, { sign: true })}, ${formatPct(change.pnlPct)}${
                change.coveragePct < 99 ? `, over the ${Math.round(change.coveragePct)}% of value with a price history` : ""
              }`}
              style={styles.inline}
            >
              {change.pnlUsd >= 0 ? (
                <ArrowUpRight size={14} strokeWidth={1.5} color={color.positive} />
              ) : (
                <ArrowDownRight size={14} strokeWidth={1.5} color={color.negative} />
              )}
              <Text variant="data-sm" tone={change.pnlUsd >= 0 ? "positive" : "negative"}>
                {hidden ? MASK : formatUsd(change.pnlUsd, { sign: true })} ({formatPct(change.pnlPct)}) 24h
              </Text>
              {change.coveragePct < 99 && (
                <Text variant="label" tone="muted">
                  · over {Math.round(change.coveragePct)}% of value
                </Text>
              )}
            </View>
          )}
        </View>
        <Pressable
          onPress={() => setHidden(!hidden)}
          accessibilityRole="switch"
          accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
          accessibilityState={{ checked: hidden }}
          style={styles.eye}
        >
          {hidden ? <EyeOff size={18} strokeWidth={1.5} color={color.accent} /> : <Eye size={18} strokeWidth={1.5} color={color["text-secondary"]} />}
        </Pressable>
      </View>

      <Performance enabled={snapshot !== null} updated={feed.stale || feed.fetchedAt === null ? null : feed.refreshing ? "Refreshing…" : `Updated ${formatAge(feed.fetchedAt, now)}`} />
      <View style={styles.grid}>
        <Figure label="Available" explanation="Stablecoins plus free collateral reported by connected venues. This is the capital available before any venue-specific restrictions or network fees.">
          {summary === null ? <Skeleton width={80} /> : <Money value={summary.availableCapitalUsd} variant="h1" reason="No stablecoin or venue collateral was readable." />}
        </Figure>
        <Figure label="Open PnL" explanation={pnlExplanation}>
          {summary === null ? (
            <Skeleton width={60} />
          ) : (
            <Money
              value={summary.unrealizedPnlUsd}
              variant="h1"
              sign
              reason="No open position reported a PnL."
              tone={summary.unrealizedPnlUsd === null || summary.unrealizedPnlUsd === 0 ? "primary" : summary.unrealizedPnlUsd > 0 ? "positive" : "negative"}
            />
          )}
        </Figure>
      </View>

      {(feed.stale || failed.length > 0) && (
        <Notice tone="caution">
          {feed.stale
            ? `Last known values${feed.fetchedAt !== null ? `, read ${formatAge(feed.fetchedAt, now)}` : ""} — the latest refresh failed. `
            : ""}
          {failed.length > 0 ? `Incomplete — ${failed.map((note) => `${note.scope}: ${note.reason}`).join(" · ")}` : ""}
        </Notice>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  eye: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  performance: { gap: 8, minHeight: 24 },
  caption: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 4 },
  periodLabel: { minWidth: 48, paddingRight: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  figure: { flex: 1, flexBasis: 110, gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: color["surface-raised"] },
  figureLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
