import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { EventsView, MarketsResponse, PredictionViewResponse, ToolMarketRow, TrendingView } from "@/lib/prediction/api";
import { isPredictionFailure } from "@/lib/prediction/api";
import type { PredictionMarket } from "@/lib/providers/types";
import { cents, closing, usdShort, PRICES_NOT_FORECASTS } from "~/components/research/prediction/format";
import { Card, Chips, Empty, Loading, Problem, Timestamp, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Prediction markets — trending, by category, or searched.

   Three reads, one row: the question, its leading outcomes as implied
   probability in percent and in cents (the same number — a share pays $1),
   24-hour volume and when it closes. A row opens the market's own screen.
   Data is Polymarket's and is attributed as such; Elyra is not affiliated
   with it, and a probability here is a price, not a forecast.
--------------------------------------------------------------------------- */

export interface MarketRow {
  id: string;
  question: string;
  outcomes: { label: string; price: number }[];
  volume24hUsd: number | null;
  endsAt: string | null;
  closed: boolean;
}

const CATEGORIES = [
  { value: "trending", label: "Trending" },
  { value: "crypto", label: "Crypto" },
  { value: "politics", label: "Politics" },
  { value: "sports", label: "Sports" },
  { value: "tech", label: "Tech" },
  { value: "geopolitics", label: "Geopolitics" },
] as const;
type Category = (typeof CATEGORIES)[number]["value"];

const EXAMPLES = ["Bitcoin", "Fed rates", "Elections"];

function fromTool(row: ToolMarketRow): MarketRow {
  return {
    id: row.marketId,
    question: row.question,
    outcomes: row.outcomes.map((outcome) => ({ label: outcome.label, price: outcome.impliedProbabilityPct / 100 })),
    volume24hUsd: row.volume24hUsd,
    endsAt: row.endsAt,
    closed: row.status === "closed" || row.status === "resolved",
  };
}

function fromSearch(market: PredictionMarket): MarketRow {
  return {
    id: market.id,
    question: market.question,
    outcomes: market.outcomes.map((outcome) => ({ label: outcome.label, price: outcome.price })),
    volume24hUsd: market.volume24hUsd,
    endsAt: market.endsAt,
    closed: market.closed || market.status === "resolved" || market.status === "closed",
  };
}

export function openMarket(id: string): void {
  router.push({ pathname: "/prediction/[id]", params: { id } });
}

export function MarketRowView({ row, now }: { row: MarketRow; now: number }) {
  const leading = [...row.outcomes].sort((a, b) => b.price - a.price).slice(0, 2);
  return (
    <Pressable
      onPress={() => openMarket(row.id)}
      accessibilityRole="button"
      accessibilityLabel={`${row.question}. ${leading.map((outcome) => `${outcome.label} ${Math.round(outcome.price * 100)} percent`).join(", ")}`}
      style={styles.row}
    >
      <View style={shared.flex}>
        <Text variant="body-sm" numberOfLines={3}>
          {row.question}
        </Text>
        <View style={styles.outcomes}>
          {leading.map((outcome) => (
            <Text key={outcome.label} variant="data-sm" tone="secondary">
              {outcome.label}{" "}
              <Text variant="data-sm" tone="primary">
                {(outcome.price * 100).toFixed(0)}%
              </Text>
              <Text variant="data-sm" tone="muted">
                {" "}
                · {cents(outcome.price)}
              </Text>
            </Text>
          ))}
        </View>
        <Text variant="label" tone="muted">
          24h volume {usdShort(row.volume24hUsd)} · {closing(row.endsAt, now, row.closed)}
        </Text>
      </View>
      <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
    </Pressable>
  );
}

export function MarketList({ rows, now }: { rows: MarketRow[]; now: number }) {
  return (
    <Card style={styles.list}>
      {rows.map((row, index) => (
        <View key={row.id} style={index > 0 ? styles.rule : undefined}>
          <MarketRowView row={row} now={now} />
        </View>
      ))}
    </Card>
  );
}

export function Markets({ active }: { active: boolean }) {
  const now = useMinute();
  const [category, setCategory] = useState<Category>("trending");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);

  const trending = useResearch<PredictionViewResponse<TrendingView>>(active && searched === null && category === "trending" ? "/api/app/prediction?view=trending" : null, {
    pollMs: 5 * 60_000,
    timeoutMs: 45_000,
  });
  const events = useResearch<PredictionViewResponse<EventsView>>(
    active && searched === null && category !== "trending" ? `/api/app/prediction?view=events&category=${category}` : null,
    { timeoutMs: 45_000 },
  );
  const search = useResearch<MarketsResponse>(active && searched !== null ? `/api/prediction/markets?q=${encodeURIComponent(searched ?? "")}` : null, { timeoutMs: 45_000 });

  const feed = searched !== null ? search : category === "trending" ? trending : events;
  let rows: MarketRow[] = [];
  let failure: string | null = null;
  let asOf: string | null = null;
  if (searched !== null && search.data !== null) {
    rows = search.data.markets.map(fromSearch);
    asOf = search.data.asOf;
  } else if (category === "trending" && trending.data !== null) {
    const data = trending.data.data;
    if (isPredictionFailure(data)) failure = data.error;
    else {
      rows = data.markets.map(fromTool);
      asOf = data.asOf;
    }
  } else if (category !== "trending" && events.data !== null) {
    const data = events.data.data;
    if (isPredictionFailure(data)) failure = data.error;
    else {
      /* An event's markets, each a row — the open ones, busiest first. */
      rows = data.events.flatMap((event) => event.markets.map(fromTool)).filter((row) => !row.closed);
      asOf = data.asOf;
    }
  }

  const submit = (text: string) => {
    const value = text.trim();
    if (value.length === 0) return;
    setQuery(value);
    setSearched(value);
  };

  return (
    <View style={styles.view}>
      <TextField
        label="Search prediction markets"
        value={query}
        onChangeText={setQuery}
        placeholder="A topic — Bitcoin, the Fed, an election…"
        maxLength={200}
        returnKeyType="search"
        onSubmitEditing={() => submit(query)}
      />
      <View style={shared.row}>
        {EXAMPLES.map((example) => (
          <Button key={example} label={example} size="sm" variant="ghost" onPress={() => submit(example)} />
        ))}
        {searched !== null && (
          <Button
            label="Clear search"
            size="sm"
            variant="ghost"
            onPress={() => {
              setSearched(null);
              setQuery("");
            }}
          />
        )}
      </View>
      {searched === null ? (
        <Chips<Category> label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
      ) : (
        <Text variant="label" tone="secondary">
          Markets matching “{searched}”
        </Text>
      )}

      {feed.loading && <Loading>Reading Polymarket…</Loading>}
      {feed.error !== null && feed.data === null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {failure !== null && <Problem retry={feed.reload}>{failure}</Problem>}
      {search.data?.stale === true && searched !== null && (
        <Text variant="label" tone="caution">
          Cached search results · current market details may differ.
        </Text>
      )}
      {feed.data !== null && failure === null && rows.length === 0 && (
        <Empty title="No markets found" body={searched !== null ? "Try another topic." : "Nothing open in this category right now."} />
      )}
      {rows.length > 0 && <MarketList rows={rows} now={now} />}
      <Timestamp at={asOf} label="Polymarket ·" />
      <Text variant="label" tone="muted">
        {PRICES_NOT_FORECASTS} Elyra is not affiliated with Polymarket.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 12 },
  list: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 72, paddingVertical: 10 },
  outcomes: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, marginTop: 2 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});
