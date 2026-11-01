import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, Bookmark, BookmarkCheck, Clock, Search, X } from "lucide-react-native";
import { formatRelativeTime } from "@/lib/format";
import type { EventsView, MarketsResponse, PredictionViewResponse, ToolMarketRow, TrendingView } from "@/lib/prediction/api";
import { isPredictionFailure } from "@/lib/prediction/api";
import type { PredictionMarket } from "@/lib/providers/types";
import { closing, marketLifecycle, quoteCents, usdShort, PRICES_NOT_FORECASTS, type MarketLifecycle } from "~/components/research/prediction/format";
import { Chips, Empty, Loading, Problem, SerifHeading, useResearch } from "~/components/research/parts";
import { IconButton } from "~/components/ui/controls";
import { useToast } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { unwatch, useWatchedMarkets, watch } from "~/lib/stores/prediction";
import { useMinute } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Prediction markets — trending, by category, or searched.

   Three reads, one card each: the provider's category where it gives one,
   the question in full, its outcomes' prices in cents (a share pays $1, so
   the price is the implied probability — each quoted on its own, never
   forced to sum to 100), 24-hour volume and where the market stands. Past
   its close date is not resolved: only the provider says it has resolved.
   The bookmark is the account's prediction watchlist. A quote tile only
   shows a price; View market opens the market's own screen.
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
  /** The provider's status, where it gives one: open, closed, resolved, cancelled. */
  status: string | null;
  /** The provider's own category label, where it gives one. Never invented. */
  category: string | null;
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

function fromTool(row: ToolMarketRow, category: string | null = null): MarketRow {
  return {
    id: row.marketId,
    question: row.question,
    outcomes: row.outcomes.map((outcome) => ({ label: outcome.label, price: outcome.impliedProbabilityPct / 100 })),
    volume24hUsd: row.volume24hUsd,
    endsAt: row.endsAt,
    closed: row.status === "closed" || row.status === "resolved",
    status: row.status ?? null,
    category,
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
    status: market.status ?? null,
    category: market.categories?.[0] ?? null,
  };
}

export function openMarket(id: string): void {
  router.push({ pathname: "/prediction/[id]", params: { id } });
}

const LIFECYCLE: Record<Exclude<MarketLifecycle, "open">, { label: string; tone: "caution" | "secondary" }> = {
  "past-close": { label: "Past close date", tone: "caution" },
  closed: { label: "Closed", tone: "secondary" },
  resolved: { label: "Resolved", tone: "secondary" },
  cancelled: { label: "Cancelled", tone: "secondary" },
};

/** One outcome's price. A plain tile: it shows a price and does nothing else. */
function QuoteTile({ label, price }: { label: string; price: number | null }) {
  const text = quoteCents(price);
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}, ${text === "—" ? "no price" : text.replace("¢", " cents")}`}>
      <Text variant="body" tone="secondary" numberOfLines={2} style={styles.tileLabel}>
        {label}
      </Text>
      <Text variant="price" style={styles.tileValue}>
        {text}
      </Text>
    </View>
  );
}

/** A market as a card: category and bookmark, the question in full, its quotes, volume and state, and View market. */
export function MarketCard({ row, now, watched, onToggleWatch }: { row: MarketRow; now: number; watched: boolean | null; onToggleWatch: () => void }) {
  /* Two outcomes in the provider's own order (a binary market's Yes, then
     No); more than two, the two priced highest, with the rest counted. */
  const shown = row.outcomes.length <= 2 ? row.outcomes : [...row.outcomes].sort((a, b) => b.price - a.price).slice(0, 2);
  const more = row.outcomes.length - shown.length;
  const stage = marketLifecycle(row, now);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          {row.category !== null && (
            <Text variant="eyebrow" style={styles.category}>
              {row.category}
            </Text>
          )}
          <Text variant="body" style={styles.question}>
            {row.question}
          </Text>
        </View>
        {watched !== null && (
          <IconButton accessibilityLabel={watched ? "Remove from your prediction watchlist" : "Add to your prediction watchlist"} onPress={onToggleWatch}>
            {watched ? (
              <BookmarkCheck size={24} strokeWidth={1.5} color={color["accent-hover"]} />
            ) : (
              <Bookmark size={24} strokeWidth={1.5} color={color["text-primary"]} />
            )}
          </IconButton>
        )}
      </View>
      {shown.length > 0 ? (
        <View style={styles.tiles}>
          {shown.map((outcome) => (
            <QuoteTile key={outcome.label} label={outcome.label} price={outcome.price} />
          ))}
        </View>
      ) : (
        <Text variant="body" tone="secondary">
          No prices for this market.
        </Text>
      )}
      {more > 0 && (
        <Text variant="body-sm" tone="secondary">
          +{more} more {more === 1 ? "outcome" : "outcomes"} on the market&apos;s screen
        </Text>
      )}
      <View style={styles.foot}>
        <View style={styles.meta}>
          <Text variant="body-sm" tone="secondary" style={styles.metaText}>
            24h volume {usdShort(row.volume24hUsd)} ·
          </Text>
          {stage === "open" ? (
            <Text variant="body-sm" tone="secondary" style={styles.metaText}>
              {closing(row.endsAt, now)}
            </Text>
          ) : (
            <View style={styles.stage}>
              {stage === "past-close" && <Clock size={16} strokeWidth={1.75} color={color.caution} />}
              <Text variant="body-sm" tone={LIFECYCLE[stage].tone} style={styles.metaText}>
                {LIFECYCLE[stage].label}
              </Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => openMarket(row.id)} accessibilityRole="button" accessibilityLabel={`View market: ${row.question}`} style={styles.view}>
          <Text variant="body" style={styles.viewText}>
            View market
          </Text>
          <ArrowRight size={18} strokeWidth={1.75} color={color["text-primary"]} />
        </Pressable>
      </View>
    </View>
  );
}

/** The cards, with the bookmark reading and writing the account's watchlist. */
export function MarketList({ rows, now }: { rows: MarketRow[]; now: number }) {
  const watchlist = useWatchedMarkets();
  const toast = useToast();
  const watchedIds = useMemo(() => new Set((watchlist.data ?? []).map((entry) => entry.marketId)), [watchlist.data]);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = async (row: MarketRow) => {
    if (pending.has(row.id)) return;
    setPending((current) => new Set(current).add(row.id));
    const on = watchedIds.has(row.id);
    const result = on ? await unwatch(row.id) : await watch(row.id);
    setPending((current) => {
      const next = new Set(current);
      next.delete(row.id);
      return next;
    });
    toast(result.ok ? (on ? "Removed from your watchlist" : "Added to your watchlist") : result.error, result.ok ? "positive" : "negative");
  };
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <MarketCard
          key={row.id}
          row={row}
          now={now}
          watched={watchlist.data === null ? null : watchedIds.has(row.id)}
          onToggleWatch={() => void toggle(row)}
        />
      ))}
    </View>
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
      rows = data.markets.map((market) => fromTool(market));
      asOf = data.asOf;
    }
  } else if (category !== "trending" && events.data !== null) {
    const data = events.data.data;
    if (isPredictionFailure(data)) failure = data.error;
    else {
      /* An event's markets, each a row — the open ones, busiest first. */
      rows = data.events.flatMap((event) => event.markets.map((market) => fromTool(market, event.categories[0] ?? null))).filter((row) => !row.closed);
      asOf = data.asOf;
    }
  }

  const heading = searched !== null ? "Search results" : `${CATEGORIES.find((entry) => entry.value === category)?.label ?? "Trending"} markets`;

  const submit = (text: string) => {
    const value = text.trim();
    if (value.length === 0) return;
    setQuery(value);
    setSearched(value);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text variant="body" style={styles.label}>
          Search prediction markets
        </Text>
        <View style={styles.input}>
          <Search size={22} strokeWidth={1.5} color={color["text-primary"]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Bitcoin, the Fed, an election…"
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            maxLength={200}
            returnKeyType="search"
            onSubmitEditing={() => submit(query)}
            accessibilityLabel="Search prediction markets"
            style={styles.inputText}
          />
          {searched !== null && (
            <IconButton
              accessibilityLabel="Clear search"
              onPress={() => {
                setSearched(null);
                setQuery("");
              }}
            >
              <X size={20} strokeWidth={1.5} color={color["text-secondary"]} />
            </IconButton>
          )}
        </View>
      </View>
      <View style={styles.suggestions}>
        {EXAMPLES.map((example) => (
          <Pressable
            key={example}
            onPress={() => submit(example)}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${example}`}
            style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
          >
            <Text variant="body" style={styles.suggestionText}>
              {example}
            </Text>
          </Pressable>
        ))}
      </View>
      {searched === null && <Chips<Category> label="Category" value={category} onChange={setCategory} options={CATEGORIES} />}

      <SerifHeading
        right={
          asOf !== null && Number.isFinite(Date.parse(asOf)) ? (
            <Text variant="body-sm" tone="secondary" accessibilityLabel={`Polymarket prices read ${formatRelativeTime(asOf, now)}`}>
              Updated {formatRelativeTime(asOf, now)}
            </Text>
          ) : undefined
        }
      >
        {heading}
      </SerifHeading>
      {searched !== null && (
        <Text variant="body" tone="secondary" style={styles.note}>
          Markets matching “{searched}”
        </Text>
      )}

      {feed.loading && <Loading>Reading Polymarket…</Loading>}
      {feed.error !== null && feed.data === null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {failure !== null && <Problem retry={feed.reload}>{failure}</Problem>}
      {search.data?.stale === true && searched !== null && (
        <Text variant="body-sm" tone="caution">
          Cached search results · current market details may differ.
        </Text>
      )}
      {feed.data !== null && failure === null && rows.length === 0 && (
        <Empty title="No markets found" body={searched !== null ? "Try another topic." : "Nothing open in this category right now."} />
      )}
      {rows.length > 0 && <MarketList rows={rows} now={now} />}
      <Text variant="body-sm" tone="secondary" style={styles.note}>
        Prices in cents: a share pays $1, so its price is the market&apos;s implied probability. {PRICES_NOT_FORECASTS} Elyra is not affiliated with Polymarket.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  flex: { flex: 1, minWidth: 0, gap: 6 },
  pressed: { backgroundColor: color["surface-hover"] },
  note: { fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontSize: 16, lineHeight: 22 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputText: { flex: 1, minWidth: 0, minHeight: 56, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 17 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestion: { minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-strong"] },
  suggestionText: { fontSize: 15, lineHeight: 20 },
  list: { gap: 14 },
  card: { gap: 14, padding: 18, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"] },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginRight: -10, marginTop: -6 },
  category: { color: color.positive, fontSize: 13, lineHeight: 17, letterSpacing: 1, marginTop: 6 },
  question: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 25, paddingTop: 6 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
  },
  tileLabel: { fontSize: 15, lineHeight: 20, textAlign: "center" },
  tileValue: { fontSize: 26, lineHeight: 32 },
  foot: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", columnGap: 12 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6, flexShrink: 1 },
  metaText: { fontSize: 14, lineHeight: 20 },
  stage: { flexDirection: "row", alignItems: "center", gap: 6 },
  view: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, marginLeft: "auto" },
  viewText: { fontFamily: fontFamily("sans", 500), fontSize: 15, lineHeight: 20 },
});
