import { Pressable, StyleSheet, View } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { formatRelativeTime } from "@/lib/format";
import {
  isNotConnected,
  isPredictionFailure,
  type ActivityView,
  type OrdersView,
  type PositionRow,
  type PositionsView,
  type PredictionViewResponse,
  type SummaryView,
} from "@/lib/prediction/api";
import { openMarket } from "~/components/research/prediction/Markets";
import { closing, percent, usdShort } from "~/components/research/prediction/format";
import { PolymarketLink } from "~/components/research/prediction/PolymarketLink";
import { AskButton, Card, Heading, Loading, Problem, Timestamp, styles as shared, useResearch, type Resource } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { usePredictionAccount } from "~/lib/stores/prediction";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Your prediction-market exposure — the Mini App's Prediction view and the
   chat's prediction commands, as native sections.

   Read through the agent's own tools (/api/app/prediction), so a position's
   value and its maximum loss mean the same here as in an answer. All of it
   is read-only: a position opens its market's screen, and the account opens
   on Polymarket. Not linked is said as not linked — never as $0, because
   positions that cannot be seen are not positions that do not exist.
--------------------------------------------------------------------------- */

type ViewFeed<T> = Resource<PredictionViewResponse<T>>;

function Figure({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <View style={styles.figure}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data" tone={tone ?? "primary"}>
        {value}
      </Text>
    </View>
  );
}

function signedTone(value: number | null): "positive" | "negative" | undefined {
  return value === null ? undefined : value > 0 ? "positive" : value < 0 ? "negative" : undefined;
}

/** A view's state, said once: loading, failed with its reason, or the data. */
function viewData<T>(view: ViewFeed<T>): { data: T | null; problem: string | null } {
  const raw = view.data?.data;
  if (raw === undefined) return { data: null, problem: view.error };
  if (isPredictionFailure(raw)) return { data: null, problem: raw.error };
  return { data: raw as T, problem: null };
}

function PositionItem({ row, now }: { row: PositionRow; now: number }) {
  return (
    <Pressable onPress={() => openMarket(row.marketId)} accessibilityRole="button" accessibilityHint="Opens the market" style={styles.position}>
      <View style={shared.flex}>
        <Text variant="body-sm" numberOfLines={2}>
          {row.market}
        </Text>
        <Text variant="label" tone="secondary">
          {row.outcome} · {row.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares · {percent(row.entryProbabilityPct, 0)} → {percent(row.currentProbabilityPct, 0)}
        </Text>
        <Text variant="label" tone="muted">
          Max loss {usdShort(row.maxLossUsd)} · max payout {usdShort(row.maxPayoutUsd)} · {row.status === "open" ? closing(row.endsAt, now) : row.status}
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="data">{usdShort(row.currentValueUsd)}</Text>
        <Text variant="data-sm" tone={signedTone(row.pnlUsd)}>
          {row.pnlUsd === null ? "—" : `${row.pnlUsd >= 0 ? "+" : ""}${usdShort(row.pnlUsd)}`}
          {row.pnlPct === null ? "" : ` · ${row.pnlPct >= 0 ? "+" : ""}${row.pnlPct.toFixed(1)}%`}
        </Text>
      </View>
    </Pressable>
  );
}

function Positions({ rows, now, empty }: { rows: PositionRow[]; now: number; empty: string }) {
  if (rows.length === 0) {
    return (
      <Text variant="body-sm" tone="secondary">
        {empty}
      </Text>
    );
  }
  return (
    <Card style={styles.list}>
      {rows.map((row, index) => (
        <View key={row.positionId} style={index > 0 ? styles.rule : undefined}>
          <PositionItem row={row} now={now} />
        </View>
      ))}
    </Card>
  );
}

export function Exposure({ active }: { active: boolean }) {
  const now = useMinute();
  const account = usePredictionAccount();
  const linked = account.data?.connected === true;
  const read = active && linked;
  const summary = useResearch<PredictionViewResponse<SummaryView>>(read ? "/api/app/prediction?view=summary" : null, { pollMs: 2 * 60_000, timeoutMs: 45_000 });
  const positions = useResearch<PredictionViewResponse<PositionsView>>(read ? "/api/app/prediction?view=positions" : null, { pollMs: 2 * 60_000, timeoutMs: 45_000 });
  const expiring = useResearch<PredictionViewResponse<PositionsView>>(read ? "/api/app/prediction?view=expiring" : null, { timeoutMs: 45_000 });
  const activity = useResearch<PredictionViewResponse<ActivityView>>(read ? "/api/app/prediction?view=activity" : null, { timeoutMs: 45_000 });
  const orders = useResearch<PredictionViewResponse<OrdersView>>(read ? "/api/app/prediction?view=orders" : null);

  const s = viewData(summary);
  const p = viewData(positions);
  const e = viewData(expiring);
  const a = viewData(activity);
  const ordersNote = orders.data?.data && "error" in orders.data.data ? orders.data.data.error : null;
  const notLinked = [summary, positions].some((view) => isNotConnected(view.data?.data));
  const address = account.data?.address ?? null;

  return (
    <View style={styles.view}>
      <PolymarketLink />
      {linked && !notLinked && (
        <>
          <Heading
            note={
              address !== null ? (
                <Button
                  label="Polymarket"
                  size="sm"
                  variant="ghost"
                  accessibilityLabel="Open this account on Polymarket"
                  icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
                  onPress={() => openExternal(`https://polymarket.com/profile/${address}`)}
                />
              ) : undefined
            }
          >
            Summary
          </Heading>
          {summary.loading && <Loading>Reading your positions…</Loading>}
          {s.problem !== null && <Problem retry={summary.reload}>{s.problem}</Problem>}
          {s.data !== null && (
            <Card>
              <View style={styles.figures}>
                <Figure label="Value" value={usdShort(s.data.currentValueUsd)} />
                <Figure label="Unrealised P&L" value={usdShort(s.data.unrealisedPnlUsd)} tone={signedTone(s.data.unrealisedPnlUsd)} />
                <Figure label="Capital at risk" value={usdShort(s.data.capitalAtRiskUsd)} />
                <Figure label="Max payout" value={usdShort(s.data.maxPayoutUsd)} />
                <Figure label="Open markets" value={String(s.data.activeMarkets)} />
                <Figure label="Claimable" value={s.data.claimable.count === 0 ? "None" : `${s.data.claimable.count} · ${usdShort(s.data.claimable.valueUsd)}`} />
              </View>
              <Text variant="label" tone="muted">
                {s.data.resolvingWithin24h} resolving within 24h · {s.data.resolvingWithin7d} within 7 days. Each share settles at $1 or $0, so the maximum loss and payout are exact.
              </Text>
              {s.data.warnings?.map((warning) => (
                <Text key={warning} variant="label" tone="caution">
                  {warning}
                </Text>
              ))}
              <Timestamp at={s.data.asOf} label="Polymarket ·" />
              <AskButton prompt="Walk me through my prediction-market positions: where my capital is concentrated, what resolves soon, and what I could lose." />
            </Card>
          )}

          <Heading>Positions</Heading>
          {positions.loading && <Loading>Reading positions…</Loading>}
          {p.problem !== null && <Problem retry={positions.reload}>{p.problem}</Problem>}
          {p.data !== null && <Positions rows={p.data.positions} now={now} empty="No positions on this account." />}

          <Heading>Expiring within a week</Heading>
          {e.problem !== null && <Problem retry={expiring.reload}>{e.problem}</Problem>}
          {e.data !== null && <Positions rows={e.data.positions} now={now} empty="Nothing you hold resolves in the next seven days." />}

          <Heading>Activity</Heading>
          {a.problem !== null && <Problem retry={activity.reload}>{a.problem}</Problem>}
          {a.data !== null &&
            (a.data.activity.length === 0 ? (
              <Text variant="body-sm" tone="secondary">
                No recent activity.
              </Text>
            ) : (
              <Card style={styles.list}>
                {a.data.activity.slice(0, 30).map((row, index) => (
                  <View key={`${row.at}-${index}`} style={[styles.activity, index > 0 && styles.rule]}>
                    <View style={shared.flex}>
                      <Text variant="body-sm" numberOfLines={2}>
                        {row.market}
                      </Text>
                      <Text variant="label" tone="muted">
                        {row.kind}
                        {row.outcome ? ` · ${row.outcome}` : ""}
                        {row.shares !== null ? ` · ${row.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} sh` : ""}
                        {row.probabilityPct !== null ? ` at ${percent(row.probabilityPct, 0)}` : ""} · {formatRelativeTime(row.at, now)}
                      </Text>
                    </View>
                    <Text variant="data-sm">{usdShort(row.usdValue)}</Text>
                  </View>
                ))}
              </Card>
            ))}

          <Heading>Open orders</Heading>
          <Text variant="body-sm" tone="secondary">
            {ordersNote ?? "Resting orders could not be read."} They are shown on Polymarket, where they are managed.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 12 },
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 10, columnGap: 12 },
  figure: { flexBasis: "45%", flexGrow: 1, gap: 2 },
  list: { paddingVertical: 0, gap: 0 },
  position: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, paddingVertical: 10 },
  activity: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  right: { alignItems: "flex-end", gap: 2 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});
