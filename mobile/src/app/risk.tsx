import { StyleSheet, View } from "react-native";
import { capitalHealth } from "@/lib/portfolio/derive";
import type { HealthTone } from "@/lib/portfolio/types";
import { Block, DetailScreen, ReadState, ShareBar } from "~/components/portfolio/parts";
import { Text } from "~/components/ui/Text";
import { Money } from "~/components/ui/values";
import { useAppView } from "~/lib/stores/portfolioViews";
import { usePortfolio } from "~/lib/stores/portfolio";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Risk — exposure and concentration, by the definitions the assistant uses
   (the portfolio_risk tool, which the chat's /positions and the Mini App's
   Risk showed): exposure to an asset spans venues, so a spot holding and a
   perpetual on the same asset are one position; equity is the portfolio's
   total; gross perp exposure is the sum of notionals.

   Under it, the website's capital health — stablecoin reserve, the largest
   position, perps margin, the nearest liquidation and agent exposure — from
   the same snapshot (lib/portfolio/derive.ts).
--------------------------------------------------------------------------- */

const TONE: Record<HealthTone, { dot: string; text: "positive" | "caution" | "negative" | "secondary" }> = {
  good: { dot: color.positive, text: "positive" },
  watch: { dot: color.caution, text: "caution" },
  risk: { dot: color.negative, text: "negative" },
  neutral: { dot: color["text-muted"], text: "secondary" },
};

export default function RiskScreen() {
  const risk = useAppView("risk");
  const portfolio = usePortfolio();
  const data = risk.data;
  const health = portfolio.snapshot === null ? [] : capitalHealth(portfolio.snapshot);

  return (
    <DetailScreen
      title="Risk"
      refreshing={risk.refreshing}
      onRefresh={() => {
        risk.refetch();
        portfolio.refetch();
      }}
    >
      <ReadState loading={risk.loading} error={risk.error} stale={risk.stale} hasData={data !== null} onRetry={risk.refetch} refreshing={risk.refreshing} />

      {data !== null && (
        <>
          <Block label="Equity and leverage">
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text variant="label" tone="muted">
                  Equity
                </Text>
                <Money value={data.equityUsd} reason="The total could not be valued." variant="h1" />
              </View>
              <View style={styles.cell}>
                <Text variant="label" tone="muted">
                  Gross perp exposure
                </Text>
                <Money value={data.grossPerpExposureUsd} reason="Not reported." variant="h2" />
              </View>
              <View style={styles.cell}>
                <Text variant="label" tone="muted">
                  Perp leverage vs equity
                </Text>
                <Text variant="h2">{data.perpLeverageVsEquity === null ? "—" : `${data.perpLeverageVsEquity.toFixed(2)}x`}</Text>
              </View>
            </View>
            {data.incomplete && (
              <Text variant="label" tone="caution">
                Some sources could not be read, so these figures may be incomplete.
              </Text>
            )}
          </Block>

          <Block label="Largest exposures">
            <Text variant="h2" accessibilityRole="header">
              Largest exposures
            </Text>
            {data.largestExposures.length === 0 ? (
              <Text variant="body-sm" tone="secondary">
                No counted exposure — nothing verified and priced is held.
              </Text>
            ) : (
              data.largestExposures.map((exposure) => (
                <View
                  key={exposure.asset}
                  accessible
                  accessibilityLabel={`${exposure.asset}: ${exposure.pctOfEquity === null ? "share unknown" : `${exposure.pctOfEquity}% of equity`}`}
                  style={styles.exposure}
                >
                  <View style={styles.between}>
                    <Text variant="data">{exposure.asset}</Text>
                    <View style={styles.inline}>
                      <Money value={exposure.exposureUsd} reason="Not valued." />
                      <Text variant="data-sm" tone="secondary">
                        {exposure.pctOfEquity === null ? "—" : `${exposure.pctOfEquity}%`}
                      </Text>
                    </View>
                  </View>
                  <ShareBar pct={exposure.pctOfEquity} />
                </View>
              ))
            )}
            <Text variant="label" tone="muted">
              {data.note} A share above 100% is leverage: perpetuals count at their full notional.
            </Text>
          </Block>
        </>
      )}

      {health.length > 0 && (
        <Block label="Capital health">
          <Text variant="h2" accessibilityRole="header">
            Capital health
          </Text>
          {health.map((metric) => (
            <View key={metric.key} style={styles.metric}>
              <View style={[styles.dot, { backgroundColor: TONE[metric.tone].dot }]} />
              <View style={styles.flex}>
                <View style={styles.between}>
                  <Text variant="body-sm">{metric.label}</Text>
                  <Text variant="data" tone={TONE[metric.tone].text}>
                    {metric.value}
                  </Text>
                </View>
                <Text variant="label" tone="muted">
                  {metric.detail}
                </Text>
              </View>
            </View>
          ))}
        </Block>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 20 },
  cell: { minWidth: 120, gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  exposure: { gap: 6, paddingVertical: 4 },
  metric: { flexDirection: "row", gap: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 6 },
});
