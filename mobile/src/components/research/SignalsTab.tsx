import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Activity, GitBranch, Layers, SlidersHorizontal, TrendingUp, type LucideIcon } from "lucide-react-native";
import { SIGNAL_CRITERIA } from "@/lib/research/signalCriteria";
import type { SignalType } from "@/lib/research/signalTypes";
import type { ResearchSignalsResponse } from "@/lib/research/types";
import { AskButton, Card, Chips, Loading, Problem, Timestamp, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Signals — the website's SignalsTab and the chat's /signals.

   Evidence-backed observations on one asset: a move, a funding dislocation,
   a gap between venues, each with its readings, the venues that agree and
   anything pointing the other way. Below, the three things evaluated and
   where each stands — "within thresholds" is an answer, and a feed that
   could not be read is not passed off as a quiet market. The thresholds
   themselves open on tap.
--------------------------------------------------------------------------- */

const FAMILIES: { key: "price" | "funding" | "divergence"; label: string; icon: LucideIcon; types: SignalType[] }[] = [
  { key: "price", label: "Price movement", icon: TrendingUp, types: ["price_momentum", "volatility_expansion", "volume_confirmation"] },
  { key: "funding", label: "Funding", icon: Layers, types: ["funding_dislocation"] },
  { key: "divergence", label: "Venue divergence", icon: GitBranch, types: ["cross_venue_divergence", "spot_perp_basis"] },
];

export function SignalsTab({ active }: { active: boolean }) {
  const [symbol, setSymbol] = useState("SOL");
  const criteria = useRef<BottomSheetHandle>(null);
  const feed = useResearch<ResearchSignalsResponse>(active ? `/api/research/signals?symbol=${symbol}` : null, { timeoutMs: 45_000 });
  const signals = feed.data?.signals ?? [];
  const evaluation = feed.data?.evaluation;
  const complete = evaluation !== undefined && [evaluation.price, evaluation.funding, evaluation.divergence].every((state) => state === "evaluated");

  return (
    <View style={styles.tab}>
      <View style={shared.row}>
        <View style={shared.flex}>
          <Chips label="Signal asset" value={symbol} onChange={setSymbol} options={["SOL", "BTC", "ETH"].map((value) => ({ value, label: value }))} />
        </View>
        <Button
          label="Criteria"
          size="sm"
          variant="ghost"
          icon={<SlidersHorizontal size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
          onPress={() => criteria.current?.present()}
        />
      </View>
      {feed.loading && <Loading>Evaluating price, funding and venue readings…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}

      {feed.data !== null && signals.length === 0 && (
        <Card style={styles.quiet}>
          <Activity size={24} strokeWidth={1.5} color={color["text-muted"]} />
          <View style={shared.flex}>
            <Text variant="h2">{complete ? "A quiet market is a signal, too." : "Some market readings are unavailable."}</Text>
            <Text variant="body-sm" tone="secondary">
              {complete
                ? `No price, funding or venue divergence threshold crossed for ${symbol}.`
                : `No triggers came back for ${symbol}. Incomplete or stale data cannot confirm a quiet market.`}
            </Text>
          </View>
        </Card>
      )}

      {signals.map((signal) => (
        <Card key={`${signal.type}-${signal.title}`}>
          <Text variant="h2">{signal.title}</Text>
          <Text variant="label" tone="secondary">
            {signal.strength} strength · {signal.confirmationCount} venue{signal.confirmationCount === 1 ? "" : "s"} agreeing
          </Text>
          <Text variant="body-sm">{signal.summary}</Text>
          {signal.evidence.map((item, index) => (
            <View key={index} style={styles.reading}>
              <View style={shared.flex}>
                <Text variant="label" tone="muted">
                  {item.label} · {item.source}
                </Text>
                <Timestamp at={item.asOf} label="Read" />
              </View>
              <Text variant="data-sm">{item.value}</Text>
            </View>
          ))}
          {signal.contradictions.map((item) => (
            <Text key={item} variant="label" tone="negative">
              Against: {item}
            </Text>
          ))}
          <Timestamp at={signal.dataFreshness} label="Oldest reading" />
          <AskButton prompt={`About the ${signal.symbol} signal — "${signal.title}". What is the evidence behind it, and what would change it?`} />
        </Card>
      ))}

      <Card>
        {FAMILIES.map(({ key, label, icon: Icon, types }, index) => {
          const state = evaluation?.[key];
          const triggered = signals.some((signal) => types.includes(signal.type));
          const status = feed.loading
            ? "Evaluating…"
            : feed.error !== null && feed.data === null
              ? "Evaluation unavailable"
              : feed.data === null
                ? "Not evaluated"
                : triggered
                  ? "Threshold crossed"
                  : state === "evaluated"
                    ? "Within thresholds"
                    : state === "stale"
                      ? "Stale reading"
                      : state === "unsupported"
                        ? "Not supported for this asset"
                        : "Feed unavailable";
          return (
            <View key={key} style={[styles.family, index > 0 && styles.rule]}>
              <Icon size={20} strokeWidth={1.5} color={triggered ? color.accent : color["text-muted"]} />
              <Text variant="body-sm" style={shared.flex}>
                {label}
              </Text>
              <Text variant="label" tone={triggered ? "primary" : state === "evaluated" ? "secondary" : "muted"}>
                {status}
              </Text>
            </View>
          );
        })}
      </Card>
      {feed.data?.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="muted">
          {warning}
        </Text>
      ))}
      <Timestamp at={evaluation?.generatedAt ?? feed.data?.asOf} label="Evaluated" />
      <Text variant="label" tone="muted">
        Strength reflects agreement across independent data. Observations, not recommendations.
      </Text>

      <BottomSheet ref={criteria} title="Signal criteria">
        <View style={styles.sheet}>
          <Text variant="body-sm" tone="secondary">
            The thresholds Elyra&apos;s observation engine uses.
          </Text>
          {[
            ["Price movement", `Absolute 24h change of ${SIGNAL_CRITERIA.priceChangePct}% or more.`],
            ["Funding", `Absolute annualised funding of ${SIGNAL_CRITERIA.fundingPct}% or more.`],
            ["Venue divergence", `On-chain and centralised prices differ by ${SIGNAL_CRITERIA.divergenceBps} bps or more. Needs both feeds; supported on-chain assets only.`],
            [
              "Strength",
              `Price and divergence observations need at least two venue readings for medium or high strength. Magnitude of 5 or more without contradictions can be high; 2 or more can be medium. Readings older than five minutes cap strength at low. Funding dislocations are medium when fresh. Crowded funding above ${SIGNAL_CRITERIA.crowdedFundingPct}% in the direction of a price move is a contradiction.`,
            ],
          ].map(([term, definition]) => (
            <View key={term} style={styles.definition}>
              <Text variant="label">{term}</Text>
              <Text variant="body-sm" tone="secondary">
                {definition}
              </Text>
            </View>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 12 },
  quiet: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  reading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  family: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  sheet: { gap: 12, padding: 16 },
  definition: { gap: 2 },
});
