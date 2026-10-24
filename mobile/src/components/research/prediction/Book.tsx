import { StyleSheet, View } from "react-native";
import type { ProbabilityBasket } from "@/lib/prediction/basket";
import type { BookLevel } from "@/lib/prediction/book";
import type { BookAnalytics } from "@/lib/prediction/book-analytics";
import { cents, points, probability, usdShort } from "~/components/research/prediction/format";
import { Card, styles as shared } from "~/components/research/parts";
import { Text } from "~/components/ui/Text";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A market's order book, read — and the Elyra Probability Basket.

   This renders; it does not compute. Spread, depth, imbalance, microprice
   and the basket come from the API, which reads the same services the
   assistant does, so the two can never disagree. The ladder shows each
   level's cumulative depth, because that is what a taker walks through.

   The basket is an analytical reference built from observable prices — not
   a guaranteed probability, and not a forecast Elyra is making.
--------------------------------------------------------------------------- */

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

const imbalance = (value: number | null): string => (value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`);

function LadderRow({ level, side, widest }: { level: BookLevel & { total: number }; side: "bid" | "ask"; widest: number }) {
  return (
    <View style={styles.level}>
      {/* Depth bar. Decorative — the figures beside it carry the meaning. */}
      <View style={[styles.bar, { width: `${Math.min(100, (level.notional / widest) * 100)}%`, backgroundColor: side === "bid" ? color["positive-bg"] : color["negative-bg"] }]} />
      <Text variant="data-sm" tone={side === "bid" ? "positive" : "negative"} style={styles.price}>
        {cents(level.price)}
      </Text>
      <Text variant="data-sm" tone="secondary" style={styles.size}>
        {Math.round(level.size).toLocaleString("en-US")}
      </Text>
      <Text variant="data-sm" tone="muted" style={styles.total}>
        {usdShort(level.total)}
      </Text>
    </View>
  );
}

function Ladder({ bids, asks, analytics }: { bids: BookLevel[]; asks: BookLevel[]; analytics: BookAnalytics | null }) {
  const rows = 6;
  const cumulative = (levels: BookLevel[]) => levels.slice(0, rows).map((level, index, all) => ({ ...level, total: all.slice(0, index + 1).reduce((sum, entry) => sum + entry.notional, 0) }));
  const askRows = cumulative(asks).reverse();
  const bidRows = cumulative(bids);
  const widest = Math.max(1, ...askRows.map((row) => row.notional), ...bidRows.map((row) => row.notional));
  return (
    <View accessibilityLabel={`Order book: best bid ${cents(analytics?.bestBid)}, best ask ${cents(analytics?.bestAsk)}`}>
      <View style={styles.level}>
        <Text variant="label" tone="muted" style={styles.price}>
          Price
        </Text>
        <Text variant="label" tone="muted" style={styles.size}>
          Shares
        </Text>
        <Text variant="label" tone="muted" style={styles.total}>
          Cumulative
        </Text>
      </View>
      {askRows.map((level) => (
        <LadderRow key={`a${level.price}`} level={level} side="ask" widest={widest} />
      ))}
      <View style={styles.mid}>
        <Text variant="label" tone="muted">
          Mid {cents(analytics?.midpoint)}
        </Text>
        <Text variant="label" tone="muted">
          Microprice {cents(analytics?.microprice)}
        </Text>
      </View>
      {bidRows.map((level) => (
        <LadderRow key={`b${level.price}`} level={level} side="bid" widest={widest} />
      ))}
    </View>
  );
}

export function BookPanel({
  outcome,
  bids,
  asks,
  analytics,
  transport,
}: {
  outcome: string | null;
  bids: BookLevel[];
  asks: BookLevel[];
  analytics: BookAnalytics | null;
  transport: string;
}) {
  return (
    <Card>
      <View style={shared.row}>
        <Text variant="eyebrow" tone="muted" style={shared.flex}>
          Order book · {outcome ?? "first outcome"}
        </Text>
        <Text variant="label" tone="muted">
          {transport === "realtime" ? "Live feed" : "Snapshot"}
        </Text>
      </View>
      {analytics !== null && (
        <>
          <View style={styles.figures}>
            <Figure label="Spread" value={analytics.spreadPoints === null ? "—" : `${analytics.spreadPoints.toFixed(1)} pts`} />
            <Figure label="Imbalance · top 5" value={imbalance(analytics.depth.top5.imbalance)} />
            <Figure label="Weighted imbalance" value={imbalance(analytics.weightedImbalance)} />
            <Figure label="Bid depth · top 5" value={usdShort(analytics.depth.top5.bidUsd)} />
            <Figure label="Ask depth · top 5" value={usdShort(analytics.depth.top5.askUsd)} />
            <Figure label="Within 2¢" value={`${usdShort(analytics.depth.within2c.bidUsd)} / ${usdShort(analytics.depth.within2c.askUsd)}`} />
          </View>
          {(analytics.bidWalls.length > 0 || analytics.askWalls.length > 0) && (
            <Text variant="label" tone="secondary">
              Walls:{" "}
              {[...analytics.bidWalls.slice(0, 2).map((wall) => `bid ${cents(wall.price)} ${usdShort(wall.notionalUsd)}`), ...analytics.askWalls.slice(0, 2).map((wall) => `ask ${cents(wall.price)} ${usdShort(wall.notionalUsd)}`)].join(" · ")}
            </Text>
          )}
          {analytics.crossed && (
            <Text variant="label" tone="caution">
              The book is crossed — one side is stale. Figures may not be tradable.
            </Text>
          )}
          {analytics.oneSided && (
            <Text variant="label" tone="caution">
              Only one side of the book has orders.
            </Text>
          )}
        </>
      )}
      {bids.length + asks.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          No resting orders on this outcome.
        </Text>
      ) : (
        <Ladder bids={bids} asks={asks} analytics={analytics} />
      )}
      <Text variant="label" tone="muted">
        Imbalance runs from −1 (all asks) to +1 (all bids). Order book data from Polymarket.
      </Text>
    </Card>
  );
}

export function BasketPanel({ basket }: { basket: ProbabilityBasket }) {
  return (
    <Card>
      <View style={shared.row}>
        <Text variant="eyebrow" tone="muted" style={shared.flex}>
          Elyra Probability Basket
        </Text>
        <Text variant="label" tone="secondary">
          {basket.confidence} confidence
        </Text>
      </View>
      <Text variant="price">{probability(basket.basketProbability)}</Text>
      <View style={styles.figures}>
        <Figure label="Observed mid" value={probability(basket.observedMidpoint)} />
        <Figure label="Microprice" value={probability(basket.microprice)} />
        <Figure label="Recent VWAP" value={probability(basket.recentVwap)} />
        <Figure label="Last trade" value={probability(basket.observedLastTrade)} />
      </View>
      {basket.components.length > 0 && (
        <Text variant="label" tone="secondary">
          {basket.components.map((part) => `${part.label} ${probability(part.value)} × ${part.weight.toFixed(2)}`).join(" · ")}
        </Text>
      )}
      {basket.deviationFromAskPoints !== null && (
        <Text variant="label" tone="secondary">
          Difference against the executable ask: {points(basket.deviationFromAskPoints)}
        </Text>
      )}
      {basket.complementCheck !== null && (
        <Text variant="label" tone="muted">
          Yes/No integrity check {probability(basket.complementCheck)} · deviation {points(basket.complementDeviationPoints, 2)}. A No share is the complement of a Yes share in the same book, so a non-zero deviation means one side is stale or the book is crossed.
        </Text>
      )}
      {basket.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="caution">
          {warning}
        </Text>
      ))}
      <Text variant="label" tone="muted">
        An analytical reference built from observable prices. Not a guaranteed probability, and not a forecast Elyra is making.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 12 },
  figure: { flexBasis: "30%", flexGrow: 1, gap: 2 },
  level: { flexDirection: "row", alignItems: "center", minHeight: 26, paddingHorizontal: 6, overflow: "hidden", borderRadius: radius.chip },
  bar: { position: "absolute", left: 0, top: 1, bottom: 1, borderRadius: radius.chip },
  price: { width: 64 },
  size: { flex: 1, textAlign: "right" },
  total: { width: 72, textAlign: "right" },
  mid: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6, paddingVertical: 6, marginVertical: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color["border-subtle"] },
});
