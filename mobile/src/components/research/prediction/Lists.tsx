import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BellRing, ChevronRight, Trash2 } from "lucide-react-native";
import { formatRelativeTime } from "@/lib/format";
import { describeRule, type PredictionAlertRule } from "@/lib/prediction/alertTypes";
import type { SignalHistoryResponse } from "@/lib/prediction/api";
import { openMarket } from "~/components/research/prediction/Markets";
import { cents, percent } from "~/components/research/prediction/format";
import { Card, Empty, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { IconButton } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { deleteAlert, unwatch, usePredictionAlerts, useWatchedMarkets } from "~/lib/stores/prediction";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The lists behind the prediction tab: alert rules, watched markets, and
   the signals Elyra has computed for you with their forward track record —
   the Mini App's Alerts and Signals views.

   An alert TELLS; it never trades. A crossing is delivered by the
   notifications engine — push and the inbox — and the rule re-arms once the
   condition clears.
--------------------------------------------------------------------------- */

export function RuleRow({ rule, now }: { rule: PredictionAlertRule; now: number }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.row}>
      <BellRing size={16} strokeWidth={1.5} color={rule.state === "triggered" ? color.caution : color["text-secondary"]} />
      <View style={shared.flex}>
        <Text variant="body-sm">
          {rule.outcomeLabel ? `${rule.outcomeLabel} · ` : ""}
          {describeRule(rule)}
        </Text>
        <Text variant="label" tone={rule.state === "triggered" ? "caution" : "muted"}>
          {rule.state === "armed" ? "Armed" : rule.state === "triggered" ? `Fired ${rule.triggeredAt ? formatRelativeTime(rule.triggeredAt, now) : ""} · re-arms when it clears` : "Off"}
        </Text>
        {error !== null && (
          <Text variant="label" tone="negative">
            {error}
          </Text>
        )}
      </View>
      <IconButton
        accessibilityLabel={`Remove the alert: ${describeRule(rule)}`}
        disabled={removing}
        onPress={async () => {
          setRemoving(true);
          const result = await deleteAlert(rule.id);
          setError(result.ok ? null : result.error);
          setRemoving(false);
        }}
      >
        <Trash2 size={16} strokeWidth={1.5} color={color["text-muted"]} />
      </IconButton>
    </View>
  );
}

export function AlertsList() {
  const now = useMinute();
  const feed = usePredictionAlerts();
  const rules = feed.data ?? [];
  const byMarket = new Map<string, PredictionAlertRule[]>();
  for (const rule of rules) byMarket.set(rule.marketId, [...(byMarket.get(rule.marketId) ?? []), rule]);

  return (
    <View style={styles.view}>
      <Text variant="body-sm" tone="secondary">
        Set an alert on a market&apos;s screen: when an outcome crosses a probability, or moves by a number of points. A crossing comes as a notification and in your inbox. Alerts tell you; they never trade.
      </Text>
      {feed.loading && <Loading>Reading your alerts…</Loading>}
      {feed.error !== null && feed.data === null && <Problem retry={feed.refetch}>{feed.error}</Problem>}
      {feed.data !== null && rules.length === 0 && <Empty title="No prediction alerts" body="Open a market and use “Alert me” to set one." />}
      {[...byMarket.entries()].map(([marketId, group]) => (
        <Card key={marketId}>
          <Pressable onPress={() => openMarket(marketId)} accessibilityRole="button" style={styles.head}>
            <Text variant="body-sm" style={shared.flex} numberOfLines={2}>
              {group[0].marketQuestion ?? marketId}
            </Text>
            <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
          </Pressable>
          {group.map((rule) => (
            <RuleRow key={rule.id} rule={rule} now={now} />
          ))}
        </Card>
      ))}
    </View>
  );
}

export function WatchedList() {
  const now = useMinute();
  const feed = useWatchedMarkets();
  const [error, setError] = useState<string | null>(null);
  const markets = feed.data ?? [];
  return (
    <View style={styles.view}>
      {feed.loading && <Loading>Reading your watchlist…</Loading>}
      {feed.error !== null && feed.data === null && <Problem retry={feed.refetch}>{feed.error}</Problem>}
      {error !== null && <Problem>{error}</Problem>}
      {feed.data !== null && markets.length === 0 && <Empty title="No markets watched" body="Open a market and tap “Watch” to keep it here." />}
      {markets.length > 0 && (
        <Card style={styles.list}>
          {markets.map((market, index) => (
            <View key={market.marketId} style={[styles.row, index > 0 && styles.rule]}>
              <Pressable onPress={() => openMarket(market.marketId)} accessibilityRole="button" style={[shared.flex, styles.open]}>
                <Text variant="body-sm" numberOfLines={2}>
                  {market.question ?? market.marketId}
                </Text>
                <Text variant="label" tone="muted">
                  Watched {formatRelativeTime(market.addedAt, now)}
                </Text>
              </Pressable>
              <IconButton
                accessibilityLabel={`Stop watching ${market.question ?? "this market"}`}
                onPress={async () => {
                  const result = await unwatch(market.marketId);
                  setError(result.ok ? null : result.error);
                }}
              >
                <Trash2 size={16} strokeWidth={1.5} color={color["text-muted"]} />
              </IconButton>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const DIRECTION: Record<string, string> = { long_yes: "Long Yes", long_no: "Long No", long_outcome: "Long outcome", watch: "Watch", neutral: "Neutral" };

export function SignalHistory({ active }: { active: boolean }) {
  const now = useMinute();
  const feed = useResearch<SignalHistoryResponse>(active ? "/api/prediction/signals?limit=30" : null, { timeoutMs: 30_000 });
  const forward = feed.data?.forwardTrackRecord ?? null;
  const signals = feed.data?.signals ?? [];
  return (
    <View style={styles.view}>
      {feed.loading && <Loading>Reading your signal history…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {forward !== null && (
        <Card>
          <Text variant="eyebrow" tone="muted">
            Forward track record
          </Text>
          <Text variant="data">
            {forward.winRatePct === null ? "Not enough decided signals yet" : `${forward.winRatePct.toFixed(1)}% reached target`}
          </Text>
          <Text variant="label" tone="secondary">
            {forward.entered} entered · {forward.targetHit} hit target · {forward.invalidated} invalidated · {forward.expiredWithoutEntry} expired unentered
          </Text>
          {forward.averageResultPoints !== null && (
            <Text variant="label" tone="secondary">
              Average result {forward.averageResultPoints >= 0 ? "+" : ""}
              {forward.averageResultPoints.toFixed(1)} points
            </Text>
          )}
          {/* Printed so it can never be read as the backtested rate. */}
          <Text variant="label" tone="muted">
            {forward.basis}
          </Text>
        </Card>
      )}
      {feed.data !== null && signals.length === 0 && <Empty title="No signals yet" body="Open a market's signal to start a history. Each one is tracked forward against what the market did." />}
      {signals.length > 0 && (
        <Card style={styles.list}>
          {signals.map((record, index) => (
            <Pressable key={record.id} onPress={() => openMarket(record.signal.marketId)} accessibilityRole="button" style={[styles.row, index > 0 && styles.rule]}>
              <View style={shared.flex}>
                <Text variant="body-sm" numberOfLines={2}>
                  {record.signal.marketQuestion}
                </Text>
                <Text variant="label" tone="secondary">
                  {DIRECTION[record.signal.direction] ?? record.signal.direction} · {record.signal.outcomeLabel} · entry {cents(record.signal.entry.price ?? record.signal.entry.minPrice)} · {record.status.replace(/_/g, " ")}
                </Text>
                <Text variant="label" tone="muted">
                  {record.signal.strategyId} · {formatRelativeTime(record.createdAt, now)}
                  {record.resultPoints !== null ? ` · result ${record.resultPoints >= 0 ? "+" : ""}${record.resultPoints.toFixed(1)} pts` : ""}
                </Text>
              </View>
              <Text variant="data-sm" tone="muted">
                {percent(record.signal.historicalWinRate?.valuePct ?? null, 0)}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
      <Text variant="label" tone="muted">
        Analysis, not advice — a signal does not place an order.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 12 },
  list: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8 },
  open: { minHeight: 48, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});
