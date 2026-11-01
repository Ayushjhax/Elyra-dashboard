import { useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Activity, ChevronDown, ChevronUp, Clock, GitBranch, Layers, SlidersHorizontal, TrendingUp, type LucideIcon } from "lucide-react-native";
import { SIGNAL_CRITERIA } from "@/lib/research/signalCriteria";
import type { SignalType } from "@/lib/research/signalTypes";
import type { ResearchSignalsResponse } from "@/lib/research/types";
import { AskButton, Chips, Loading, Problem, SerifHeading, TabIntro, styles as shared, useResearch } from "~/components/research/parts";
import { utcTime } from "~/components/research/report";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { checkStatus, type CheckStatus, type CheckTone } from "~/lib/researchViews";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Signals — the website's SignalsTab and the chat's /signals.

   Evidence-backed observations on one asset: a move, a funding dislocation,
   a gap between venues, each with its readings, the venues that agree and
   anything pointing the other way. Below, the three things evaluated and
   where each stands — "within thresholds" is an answer, and a feed that
   could not be read is not passed off as a quiet market (checkStatus,
   lib/researchViews.ts). The thresholds themselves open on tap.

   One evaluation, two presentations: the checks as a short list, or
   expanded into a card each — never both at once. Changing the asset
   reads afresh; the last asset's answer is not shown under the new name.
--------------------------------------------------------------------------- */

const FAMILIES: { key: "price" | "funding" | "divergence"; label: string; noun: string; icon: LucideIcon; types: SignalType[] }[] = [
  { key: "price", label: "Price movement", noun: "price", icon: TrendingUp, types: ["price_momentum", "volatility_expansion", "volume_confirmation"] },
  { key: "funding", label: "Funding", noun: "funding", icon: Layers, types: ["funding_dislocation"] },
  { key: "divergence", label: "Venue divergence", noun: "venue divergence", icon: GitBranch, types: ["cross_venue_divergence", "spot_perp_basis"] },
];

const PILL: Record<CheckTone, { border: string; background: string; ink: string }> = {
  positive: { border: color["border-subtle"], background: color["positive-bg"], ink: color.positive },
  accent: { border: color["accent-hover"], background: "transparent", ink: color["accent-hover"] },
  caution: { border: color.caution, background: color["caution-bg"], ink: color.caution },
  negative: { border: color.negative, background: color["negative-bg"], ink: color.negative },
  muted: { border: color["border-strong"], background: "transparent", ink: color["text-secondary"] },
};

function StatusPill({ status }: { status: CheckStatus }) {
  const look = PILL[status.tone];
  return (
    <View style={[styles.pill, { borderColor: look.border, backgroundColor: look.background }]}>
      <Text variant="body" maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: look.ink }]}>
        {status.label}
      </Text>
    </View>
  );
}

export function SignalsTab({ active }: { active: boolean }) {
  const [symbol, setSymbol] = useState("SOL");
  const [expanded, setExpanded] = useState(false);
  /* Criteria shares the asset row on a wider phone; on a narrow one it takes its own line so the assets never wrap. */
  const { width, fontScale } = useWindowDimensions();
  const oneRow = width / Math.max(1, fontScale) >= 400;
  const criteria = useRef<BottomSheetHandle>(null);
  const feed = useResearch<ResearchSignalsResponse>(active ? `/api/research/signals?symbol=${symbol}` : null, { timeoutMs: 45_000 });
  const signals = feed.data?.signals ?? [];
  const evaluation = feed.data?.evaluation;
  const checks = FAMILIES.map((family) => ({
    ...family,
    status: checkStatus({
      noun: family.noun,
      loading: feed.loading,
      failed: feed.error !== null,
      hasData: feed.data !== null,
      state: evaluation?.[family.key],
      triggered: signals.some((signal) => family.types.includes(signal.type)),
    }),
  }));
  const quiet = feed.data !== null && signals.length === 0 && checks.every((check) => check.status.within);
  const evaluated = utcTime(evaluation?.generatedAt ?? feed.data?.asOf);

  return (
    <View style={styles.tab}>
      <TabIntro title="Signals, in context." lead="Price, funding and venue observations." />
      <View style={[styles.controls, !oneRow && styles.controlsStacked]}>
        <View style={oneRow ? shared.flex : undefined}>
          <Chips wrap label="Signal asset" value={symbol} onChange={setSymbol} options={["SOL", "BTC", "ETH"].map((value) => ({ value, label: value }))} />
        </View>
        <Pressable onPress={() => criteria.current?.present()} accessibilityRole="button" accessibilityLabel="Criteria: the thresholds signals use" style={styles.criteria}>
          <SlidersHorizontal size={22} strokeWidth={1.5} color={color["text-primary"]} />
          <Text variant="body" style={styles.criteriaText}>
            Criteria
          </Text>
        </Pressable>
      </View>
      {feed.loading && <Loading>Evaluating {symbol} price, funding and venue readings…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}

      {quiet && (
        <SurfaceCard>
          <View style={styles.quietHead}>
            <Activity size={32} strokeWidth={1.5} color={color["text-secondary"]} />
            <View style={styles.tag}>
              <Text variant="eyebrow" style={styles.tagText}>
                {symbol} · No thresholds crossed
              </Text>
            </View>
          </View>
          <SerifHeading size={30}>A quiet market is a signal, too.</SerifHeading>
          <Text variant="body" tone="secondary" style={styles.lead}>
            No price, funding or venue divergence threshold crossed for {symbol}.
          </Text>
        </SurfaceCard>
      )}
      {feed.data !== null && signals.length === 0 && !quiet && (
        <SurfaceCard>
          <SerifHeading size={26}>Some readings are unavailable.</SerifHeading>
          <Text variant="body" tone="secondary" style={styles.lead}>
            No triggers came back for {symbol}, but incomplete or stale data cannot confirm a quiet market.
          </Text>
        </SurfaceCard>
      )}

      {signals.map((signal) => (
        <SurfaceCard key={`${signal.type}-${signal.title}`}>
          <SerifHeading size={26}>{signal.title}</SerifHeading>
          <Text variant="body" tone="secondary" style={styles.note}>
            {signal.strength} strength · {signal.confirmationCount} venue{signal.confirmationCount === 1 ? "" : "s"} agreeing
          </Text>
          <Text variant="body" style={styles.lead}>
            {signal.summary}
          </Text>
          <View>
            {signal.evidence.map((item, index) => (
              <View key={index} style={[styles.reading, index > 0 && styles.ruled]}>
                <View style={shared.flex}>
                  <Text variant="body" style={styles.note}>
                    {item.label} · {item.source}
                  </Text>
                  {utcTime(item.asOf) !== null && (
                    <Text variant="body-sm" tone="secondary">
                      Read {utcTime(item.asOf)}
                    </Text>
                  )}
                </View>
                <Text variant="data" style={styles.note}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          {signal.contradictions.map((item) => (
            <Text key={item} variant="body-sm" tone="negative">
              Against: {item}
            </Text>
          ))}
          {utcTime(signal.dataFreshness) !== null && (
            <Text variant="body-sm" tone="secondary">
              Oldest reading {utcTime(signal.dataFreshness)}
            </Text>
          )}
          <AskButton prompt={`About the ${signal.symbol} signal — "${signal.title}". What is the evidence behind it, and what would change it?`} />
        </SurfaceCard>
      ))}

      <View style={styles.checksHead}>
        <View style={shared.flex}>
          <SerifHeading size={28}>{expanded ? `${symbol} observations` : "What we checked"}</SerifHeading>
        </View>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show the checks as a list" : "Show each check in detail"}
          accessibilityState={{ expanded }}
          style={styles.toggle}
        >
          <Text variant="body" tone="secondary" style={styles.note}>
            {expanded ? "Less" : "Details"}
          </Text>
          {expanded ? (
            <ChevronUp size={20} strokeWidth={1.5} color={color["text-secondary"]} />
          ) : (
            <ChevronDown size={20} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
        </Pressable>
      </View>
      {expanded ? (
        checks.map(({ key, label, icon: Icon, status }) => (
          <SurfaceCard key={key} style={styles.checkCard}>
            <Icon size={28} strokeWidth={1.5} color={color["text-primary"]} />
            <View style={styles.checkWords}>
              <SerifHeading size={24}>{label}</SerifHeading>
              <StatusPill status={status} />
              <Text variant="body" tone="secondary" style={styles.lead}>
                {status.detail}
              </Text>
            </View>
          </SurfaceCard>
        ))
      ) : (
        <SurfaceCard style={styles.list}>
          {checks.map(({ key, label, icon: Icon, status }, index) => (
            <View key={key} style={[styles.family, index > 0 && styles.ruled]} accessible accessibilityLabel={`${label}: ${status.label}`}>
              <Icon size={24} strokeWidth={1.5} color={status.tone === "accent" ? color["accent-hover"] : color["text-primary"]} />
              <Text variant="body" style={[shared.flex, styles.familyLabel]}>
                {label}
              </Text>
              <Text variant="body" style={[styles.familyStatus, { color: PILL[status.tone].ink }]}>
                {status.label}
              </Text>
            </View>
          ))}
        </SurfaceCard>
      )}
      {feed.data?.warnings.map((warning) => (
        <Text key={warning} variant="body-sm" tone="caution">
          {warning}
        </Text>
      ))}
      <SurfaceCard style={styles.list}>
        <View style={styles.evaluated}>
          <Clock size={24} strokeWidth={1.5} color={color["text-secondary"]} />
          <View style={shared.flex}>
            <Text variant="body" style={styles.familyLabel}>
              Last evaluated
            </Text>
            <Text variant="body" tone="secondary" style={styles.note}>
              {evaluated ?? (feed.loading ? "Evaluating…" : "Not evaluated yet")}
            </Text>
          </View>
        </View>
        <Rule />
        <Text variant="body-sm" tone="secondary" style={styles.foot}>
          Strength reflects agreement across independent data. Observations, not recommendations.
        </Text>
      </SurfaceCard>

      <BottomSheet ref={criteria} title="Signal criteria" display>
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
  tab: { gap: 16 },
  lead: { fontSize: 16, lineHeight: 23 },
  note: { fontSize: 15, lineHeight: 21 },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  controlsStacked: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  criteria: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: TOUCH_TARGET, paddingRight: 8 },
  criteriaText: { fontSize: 16, lineHeight: 22 },
  quietHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-strong"], backgroundColor: color["positive-bg"], flexShrink: 1 },
  tagText: { color: color["accent-hover"], fontSize: 12, lineHeight: 16, letterSpacing: 1.5 },
  reading: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  checksHead: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: TOUCH_TARGET, paddingLeft: 8 },
  list: { gap: 0, paddingVertical: 4 },
  family: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 60, paddingVertical: 8 },
  familyLabel: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  familyStatus: { fontSize: 15, lineHeight: 21, textAlign: "right", flexShrink: 1, maxWidth: "50%" },
  checkCard: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  checkWords: { flex: 1, minWidth: 0, gap: 8, alignItems: "flex-start" },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  pillText: { fontSize: 15, lineHeight: 20 },
  evaluated: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
  foot: { fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  sheet: { gap: 12, padding: 16 },
  definition: { gap: 2 },
});
