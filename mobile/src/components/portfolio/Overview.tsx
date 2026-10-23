import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Eye, EyeOff } from "lucide-react-native";
import { formatAge, formatPct, formatUsd } from "@/lib/format";
import { change24h } from "@/lib/portfolio/derive";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { Button } from "~/components/ui/controls";
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1]! >= values[0]!;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline
        points={points}
        fill="none"
        stroke={rising ? color.positive : color.negative}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Performance({ enabled }: { enabled: boolean }) {
  const history = usePortfolioHistory("1W");
  const values = history.values;
  let body: React.ReactNode;
  if (!enabled) body = <Text variant="data" tone="muted">—</Text>;
  else if (history.loading) body = <Skeleton width={120} height={36} />;
  else if (values.length >= 2) body = <Sparkline values={values} />;
  else body = <Text variant="label" tone="muted">{history.error ?? "No history yet"}</Text>;

  const first = values[0];
  const last = values[values.length - 1];
  const label =
    values.length >= 2 && first !== undefined && last !== undefined
      ? `Seven days: from ${formatUsd(first)} to ${formatUsd(last)}${history.history?.basis === "reconstructed" ? ", rebuilt from prices" : ""}`
      : "Seven days";
  return (
    <View accessible accessibilityLabel={label} style={styles.figure}>
      <Text variant="label" tone="muted">
        7-day{history.history?.basis === "reconstructed" ? " · rebuilt from prices" : ""}
      </Text>
      {body}
    </View>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.figure}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
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
  const venues = (snapshot?.scopes ?? []).filter((scope) => scope.valueUsd !== undefined);

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
          {hidden ? (
            <EyeOff size={18} strokeWidth={1.5} color={color.accent} />
          ) : (
            <Eye size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
        </Pressable>
      </View>

      <View style={styles.grid}>
        <Figure label="Available">
          {summary === null ? <Skeleton width={80} /> : <Money value={summary.availableCapitalUsd} reason="No stablecoin or venue collateral was readable." />}
        </Figure>
        <Figure label="Open PnL">
          {summary === null ? (
            <Skeleton width={60} />
          ) : (
            <Money
              value={summary.unrealizedPnlUsd}
              sign
              reason="No open position reported a PnL."
              tone={summary.unrealizedPnlUsd === null || summary.unrealizedPnlUsd === 0 ? "primary" : summary.unrealizedPnlUsd > 0 ? "positive" : "negative"}
            />
          )}
        </Figure>
        <Figure label="Open positions">
          {snapshot === null ? (
            <Skeleton width={30} />
          ) : (
            <Text variant="data" accessibilityLabel={`${positionCount(snapshot)} open positions: ${snapshot.spot.length} tokens, ${snapshot.perps.length} perps, ${snapshot.defi.length} DeFi`}>
              {positionCount(snapshot)}
            </Text>
          )}
        </Figure>
        <Performance enabled={snapshot !== null} />
      </View>

      {snapshot !== null && (
        <Text variant="label" tone="muted">
          {snapshot.spot.length} token{snapshot.spot.length === 1 ? "" : "s"} · {snapshot.perps.length} perp{snapshot.perps.length === 1 ? "" : "s"} ·{" "}
          {snapshot.defi.length} DeFi position{snapshot.defi.length === 1 ? "" : "s"}
          {snapshot.prediction.connected ? ` · ${snapshot.prediction.activeMarkets ?? 0} prediction` : ""}
        </Text>
      )}

      {venues.length > 0 && (
        <View style={styles.venues}>
          <Text variant="label" tone="muted">
            Where it sits
          </Text>
          {venues.map((scope) => (
            <View key={scope.id} style={styles.venueRow}>
              <Text variant="body-sm" style={styles.flex} numberOfLines={1}>
                {scope.label}
              </Text>
              <Money value={scope.valueUsd ?? null} reason="This account could not be valued." variant="data-sm" tone="secondary" />
            </View>
          ))}
        </View>
      )}

      {(feed.stale || failed.length > 0) && (
        <Notice tone="caution">
          {feed.stale
            ? `Last known values${feed.fetchedAt !== null ? `, read ${formatAge(feed.fetchedAt, now)}` : ""} — the latest refresh failed. `
            : ""}
          {failed.length > 0 ? `Incomplete — ${failed.map((note) => `${note.scope}: ${note.reason}`).join(" · ")}` : ""}
        </Notice>
      )}
      {!feed.stale && feed.fetchedAt !== null && (
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
          {feed.refreshing ? "Refreshing…" : `Updated ${formatAge(feed.fetchedAt, now)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.panel,
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
    backgroundColor: color["surface-raised"],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  figure: { gap: 2, minWidth: 90 },
  venues: { gap: 2, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  venueRow: { flexDirection: "row", alignItems: "baseline", gap: 8, minHeight: 28 },
});
