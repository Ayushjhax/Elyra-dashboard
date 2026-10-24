import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ExternalLink } from "lucide-react-native";
import type { MarketRecap, RecapScope } from "@/lib/research/types";
import { Card, Chips, Heading, Loading, Problem, Timestamp, dollars, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Market recap — the website's RecapTab and the chat's /recap.

   Crypto or equities: the majors' 24-hour move, then for crypto the
   perpetual funding on Hyperliquid (who pays whom) and what the busiest
   prediction markets price. Each section says when it is a cached reading,
   and one that could not be read says so with its reason rather than
   disappearing. Market prices, not predictions.
--------------------------------------------------------------------------- */

const MAJORS: Record<Exclude<RecapScope, "portfolio">, string[]> = {
  crypto: ["SOL", "ETH", "BTC"],
  equities: ["SPY", "QQQ", "NVDA"],
};

export function RecapTab({ active }: { active: boolean }) {
  const [scope, setScope] = useState<"crypto" | "equities">("crypto");
  const feed = useResearch<MarketRecap>(active ? `/api/research/recap?scope=${scope}` : null, { timeoutMs: 45_000 });
  const sections = feed.data?.sections ?? [];
  const overview = sections.find((section) => section.title === (scope === "crypto" ? "Crypto" : "Equities"));
  const funding = sections.find((section) => section.title === "Perpetual funding");
  const prediction = sections.find((section) => section.title === "Prediction markets");
  const symbols = overview?.moves?.map((move) => move.symbol) ?? MAJORS[scope];

  return (
    <View style={styles.tab}>
      <View style={shared.row}>
        <View style={shared.flex}>
          <Chips
            label="Recap scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "crypto", label: "Crypto" },
              { value: "equities", label: "Equities" },
            ]}
          />
        </View>
        <Button label={feed.refreshing ? "Refreshing…" : "Refresh"} size="sm" variant="ghost" disabled={feed.loading || feed.refreshing} onPress={feed.reload} />
      </View>
      {feed.loading && <Loading>Reading markets…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}

      {overview !== undefined &&
        (overview.unavailable !== null ? (
          <Problem retry={feed.reload}>{overview.unavailable}</Problem>
        ) : (
          <>
            {symbols.map((symbol) => {
              const move = overview.moves?.find((item) => item.symbol === symbol);
              return (
                <Card key={symbol} style={styles.asset}>
                  <CoinMark symbol={symbol} size={32} />
                  <View style={shared.flex}>
                    <Text variant="label" tone="muted">
                      {symbol}
                    </Text>
                    <Text variant="data">{move ? dollars(move.price) : "—"}</Text>
                    {move?.stale && (
                      <Text variant="label" tone="caution">
                        Cached reading · may be stale
                      </Text>
                    )}
                    {move ? (
                      <Timestamp at={move.asOf} />
                    ) : (
                      <Text variant="label" tone="muted">
                        Price unavailable
                      </Text>
                    )}
                  </View>
                  {move && (
                    <Text variant="data" tone={move.changePct >= 0 ? "positive" : "negative"}>
                      {move.changePct >= 0 ? "+" : ""}
                      {percentage(move.changePct, 1)}
                      <Text variant="label" tone="muted">
                        {" "}
                        24h
                      </Text>
                    </Text>
                  )}
                </Card>
              );
            })}
            {overview.lines
              .filter((line) => line.startsWith("No move"))
              .map((line) => (
                <Text key={line} variant="label" tone="muted">
                  {line.replace("over the window", "over 24h")}
                </Text>
              ))}
          </>
        ))}

      {scope === "crypto" && feed.data !== null && (
        <>
          <Heading>Perpetual funding</Heading>
          {funding?.stale && (
            <Text variant="label" tone="caution">
              Cached funding reading · may be stale.
            </Text>
          )}
          {funding?.unavailable ? (
            <Problem retry={feed.reload}>{funding.unavailable}</Problem>
          ) : funding?.funding ? (
            <Card>
              {funding.funding.map((row, index) => (
                <View key={row.symbol} style={[styles.line, index > 0 && styles.rule]}>
                  <Text variant="data" style={styles.symbol}>
                    {row.symbol}
                  </Text>
                  <Text variant="label" tone="secondary" style={shared.flex}>
                    {row.annualisedPct > 0 ? "Longs pay shorts" : row.annualisedPct < 0 ? "Shorts pay longs" : "No payment"}
                  </Text>
                  <Text variant="data" tone={row.annualisedPct > 0 ? "positive" : row.annualisedPct < 0 ? "negative" : "secondary"}>
                    {percentage(row.annualisedPct, 1)}
                  </Text>
                </View>
              ))}
              <Timestamp at={funding.asOf} label="Hyperliquid · annualised ·" />
            </Card>
          ) : (
            <Problem retry={feed.reload}>Funding details are unavailable.</Problem>
          )}

          <Heading>Prediction markets</Heading>
          {prediction?.stale && (
            <Text variant="label" tone="caution">
              Cached market prices · may be stale.
            </Text>
          )}
          {prediction?.unavailable ? (
            <Problem retry={feed.reload}>{prediction.unavailable}</Problem>
          ) : prediction?.markets ? (
            <Card>
              {prediction.markets.map((market, index) => (
                <View key={market.id} style={[styles.market, index > 0 && styles.rule]}>
                  <View style={shared.row}>
                    <Text variant="body-sm" style={shared.flex}>
                      {market.question}
                    </Text>
                    <Text variant="data">{market.price === null ? "—" : percentage(market.price * 100, 0)}</Text>
                  </View>
                  <View style={shared.row}>
                    <Text variant="label" tone="muted" style={shared.flex}>
                      {market.outcome ?? "Unlabelled outcome"} · {market.status === "open" ? "implied probability" : `${market.status} · last price`}
                    </Text>
                    {market.url !== null && (
                      <Button
                        label="Polymarket"
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={`Open "${market.question}" on Polymarket`}
                        icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
                        onPress={() => openExternal(market.url as string)}
                      />
                    )}
                  </View>
                </View>
              ))}
              <Timestamp at={prediction.asOf} label="Polymarket ·" />
            </Card>
          ) : (
            <Problem retry={feed.reload}>Prediction-market details are unavailable.</Problem>
          )}
        </>
      )}

      {feed.data !== null && (
        <Text variant="label" tone="muted">
          {feed.data.sources.length > 0 ? `Read from ${feed.data.sources.join(", ")}. ` : ""}Market prices, not predictions.
        </Text>
      )}
      {feed.data !== null && <Timestamp at={feed.data.generatedAt} label="Recap assembled" />}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 12 },
  asset: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
  symbol: { width: 56 },
  market: { gap: 2, paddingVertical: 6 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});
