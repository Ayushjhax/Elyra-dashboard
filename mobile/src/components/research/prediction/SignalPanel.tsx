import { StyleSheet, View } from "react-native";
import type { SignalResponse } from "@/lib/prediction/api";
import { cents } from "~/components/research/prediction/format";
import { AskButton, Card, styles as shared } from "~/components/research/parts";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The technical signal on a market — the website's SignalPanel.

   Computed by Elyra's deterministic engine from the live order book: a
   direction, an entry, a target and an invalidation, with the evidence for
   and against. The historical win rate is shown only with its sample size,
   universe and definition, and "insufficient sample" is said rather than
   headlined; where no comparable history exists, the engine's own reason is
   shown. A quiet book is an answer, said with its reason.

   An observation about a price, not a recommendation: a signal places no
   order, and the wording never tells anyone to buy.
--------------------------------------------------------------------------- */

const DIRECTION: Record<string, string> = {
  long_yes: "Leans Yes",
  long_no: "Leans No",
  long_outcome: "Leans to this outcome",
  watch: "Watch",
  neutral: "Neutral",
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data-sm">{value}</Text>
    </View>
  );
}

export function SignalPanel({ response, question }: { response: SignalResponse; question: string }) {
  const signal = response.signal;
  if (signal === null) {
    return (
      <Card>
        <Text variant="eyebrow" tone="muted">
          Technical signal
        </Text>
        <Text variant="body-sm" tone="secondary">
          {response.reason ?? "No setup could be read from this order book right now."}
        </Text>
        {response.skipped.slice(0, 5).map((entry) => (
          <Text key={entry.strategyId} variant="label" tone="muted">
            {entry.strategyId} — {entry.reason}
          </Text>
        ))}
      </Card>
    );
  }

  const actionable = signal.direction === "long_yes" || signal.direction === "long_no" || signal.direction === "long_outcome";
  const entry =
    signal.entry.minPrice !== undefined && signal.entry.maxPrice !== undefined ? `${cents(signal.entry.minPrice)}–${cents(signal.entry.maxPrice)}` : cents(signal.entry.price);
  const rate = signal.historicalWinRate;

  return (
    <Card>
      <View style={shared.row}>
        <View style={shared.flex}>
          <Text variant="eyebrow" tone="muted">
            Technical signal
          </Text>
          <Text variant="body">
            {DIRECTION[signal.direction] ?? signal.direction} · {signal.outcomeLabel}
          </Text>
        </View>
        <Text variant="label" tone="secondary">
          {signal.strength} strength · {signal.liquidityQuality} liquidity
        </Text>
      </View>

      {actionable ? (
        <View style={styles.figures}>
          <Figure label="Entry" value={entry} />
          <Figure label="Target" value={cents(signal.target.price ?? signal.target.maxPrice)} />
          {/* Where a fill cannot be promised, the level is where the idea is wrong — not a price on offer. */}
          <Figure label={signal.stop.executable ? "Stop" : "Invalidation"} value={cents(signal.stop.price)} />
          <Figure label="Risk / reward" value={signal.riskReward === null ? "—" : signal.riskReward.toFixed(2)} />
        </View>
      ) : signal.entry.trigger !== undefined ? (
        <Text variant="body-sm" tone="secondary">
          {signal.entry.trigger}
        </Text>
      ) : null}
      {signal.entry.missed === true && (
        <Text variant="label" tone="caution">
          The market has already left the entry zone.
        </Text>
      )}

      <Text variant="eyebrow" tone="muted" style={styles.space}>
        Historical win rate
      </Text>
      {rate === null ? (
        <Text variant="body-sm" tone="secondary">
          {signal.winRateUnavailableReason ?? "Not available — no comparable historical sample exists for this strategy."}
        </Text>
      ) : rate.insufficientSample ? (
        <Text variant="body-sm" tone="secondary">
          Insufficient sample · {rate.sampleSize} comparable signal{rate.sampleSize === 1 ? "" : "s"} — too few to state a rate.
        </Text>
      ) : (
        <>
          <Text variant="data">
            {rate.valuePct.toFixed(1)}%{" "}
            <Text variant="label" tone="muted">
              · {rate.sampleSize} comparable signals ({rate.wins} won, {rate.losses} lost, {rate.noEntry} never entered)
            </Text>
          </Text>
          <Text variant="label" tone="muted">
            {rate.successDefinition} · {rate.marketUniverse} · {rate.lookback} · {rate.dataSource}
          </Text>
        </>
      )}

      {signal.evidence.length > 0 && (
        <>
          <Text variant="eyebrow" tone="muted" style={styles.space}>
            Evidence
          </Text>
          {signal.evidence.map((item) => (
            <View key={item.key} style={styles.evidence}>
              <Text variant="label" tone={item.direction === "supports" ? "positive" : item.direction === "contradicts" ? "negative" : "muted"} accessibilityLabel={item.direction}>
                {item.direction === "supports" ? "For" : item.direction === "contradicts" ? "Against" : "·"}
              </Text>
              <Text variant="label" tone="secondary" style={shared.flex}>
                {item.label}
              </Text>
              <Text variant="data-sm">{String(item.value)}</Text>
            </View>
          ))}
        </>
      )}

      <View style={styles.figures}>
        <Figure label="Strategy" value={`${signal.strategyId} v${signal.strategyVersion}`} />
        <Figure label="Resolution" value={signal.resolutionProximity} />
        <Figure label="Data" value={signal.transport === "realtime" ? "Live feed" : "Snapshot"} />
        <Figure label="Age" value={`${Math.round(signal.dataFreshnessMs / 1000)}s`} />
      </View>
      {signal.target.basis.length > 0 && (
        <Text variant="label" tone="muted">
          Target basis: {signal.target.basis}
        </Text>
      )}
      {signal.stop.basis.length > 0 && (
        <Text variant="label" tone="muted">
          Invalidation basis: {signal.stop.basis}
        </Text>
      )}
      {signal.eventRisk && (
        <Text variant="label" tone="caution">
          A scheduled event could move this market before the setup plays out.
        </Text>
      )}
      {signal.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="caution">
          {warning}
        </Text>
      ))}
      <AskButton prompt={`On the prediction market "${question}", Elyra's order-book signal reads ${DIRECTION[signal.direction] ?? signal.direction} on ${signal.outcomeLabel} (${signal.strength} strength). What is the evidence, and what would invalidate it?`} />
      <Text variant="label" tone="muted">
        Computed from Polymarket&apos;s live order book by Elyra&apos;s engine. Analysis, not advice — a signal does not place an order.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 12, marginTop: 4 },
  figure: { flexBasis: "45%", flexGrow: 1, gap: 2 },
  space: { marginTop: 8 },
  evidence: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color["border-subtle"] },
});
