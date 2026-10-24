import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown, FlaskConical } from "lucide-react-native";
import { formatCompactUsd, formatPct, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import type { PulseRow } from "@/lib/market/pulse";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import type { TrackerSignal } from "@/lib/tracker/types";
import { PriceFlash } from "~/components/market/PriceFlash";
import { Button } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { Notice } from "~/components/wallet/parts";
import { directionOf, refreshPrices, useAssets, useAssetsBySymbols, usePrices, useTickerLogos } from "~/lib/stores/market";
import type { SmartMoneyState } from "~/lib/stores/signals";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Live signals — the website's SignalsWidget and MarketPulse, for a phone.

   MARKET is arithmetic on the live Pyth feed: where each market's price
   sits against its EMA. SMART MONEY is wallet consensus from the tracker.
   They answer different questions with different evidence, so they stay
   two views, each with its own state in words. PULSE is the account's
   watchlist, live, and the Hyperliquid board.

   A seeded demo row is marked on the card itself, not only in a banner: a
   consensus that was never observed must not pass for one that was.
--------------------------------------------------------------------------- */

export type FeedHealth = "live" | "stale" | "disconnected" | "loading";

const HEALTH_COLOR: Record<FeedHealth, string> = {
  live: color.positive,
  stale: color["text-muted"],
  disconnected: color.negative,
  loading: color["text-muted"],
};

const HEALTH_WORD: Record<FeedHealth, string> = { live: "Live", stale: "Stale", disconnected: "Disconnected", loading: "Loading" };

export function FeedLine({ state, at, now, source }: { state: FeedHealth; at: string | null; now: number; source: string | null }) {
  return (
    <View style={styles.feedLine}>
      <View style={[styles.dot, { backgroundColor: HEALTH_COLOR[state] }]} />
      <Text variant="label" tone={state === "disconnected" ? "negative" : "secondary"}>
        {HEALTH_WORD[state]}
      </Text>
      <Text variant="label" tone="muted" numberOfLines={1} style={styles.flex}>
        {at !== null ? `· ${formatRelativeTime(at, now)}` : ""}
        {source ? ` · ${source}` : ""}
      </Text>
    </View>
  );
}

/* ---- market ---- */

/** Pyth tickers, with META pinned to Meta Platforms (the catalogue also has a MetaDAO token). */
const LIVE_MARKETS = ["SOL", "BTC", "ETH", "NVDA", "META", "AAPL", "MSFT", "TSLA"] as const;
const META_EQUITY_FEED_ID = 1272;

/** Market signals; polls only while `active`. */
export function useMarketSignals(active = true) {
  const lookup = useMemo(() => LIVE_MARKETS.filter((symbol) => symbol !== "META"), []);
  const { bySymbol } = useAssetsBySymbols(lookup);
  const meta = useAssets([META_EQUITY_FEED_ID]);
  const assets = useMemo(
    () =>
      LIVE_MARKETS.flatMap((symbol) => {
        const asset = symbol === "META" ? meta.byId.get(META_EQUITY_FEED_ID) : bySymbol.get(symbol);
        return asset ? [asset] : [];
      }),
    [bySymbol, meta.byId],
  );
  const ids = useMemo(() => (active ? assets.map((asset) => asset.id) : []), [assets, active]);
  const feed = usePrices(ids);
  const rows = assets.flatMap((asset) => {
    const row = feed.rows.get(asset.id);
    return row ? [{ asset, row }] : [];
  });
  const resolving = assets.length < LIVE_MARKETS.length || (rows.length === 0 && feed.status === "loading");
  const health: FeedHealth = feed.status === "live" ? "live" : feed.status === "error" ? (rows.length > 0 ? "stale" : "disconnected") : "loading";
  return { feed, rows, resolving, health };
}

function openAsset(asset: PythAsset) {
  router.push({ pathname: "/asset/[symbol]", params: { symbol: asset.symbol, id: String(asset.id) } });
}

function MarketRow({ asset, row, previous, seq, now }: { asset: PythAsset; row: PriceRow; previous: number | undefined; seq: number; now: number }) {
  const distance = row.emaPrice === 0 ? 0 : ((row.price - row.emaPrice) / row.emaPrice) * 100;
  const above = distance >= 0;
  return (
    <Pressable onPress={() => openAsset(asset)} accessibilityRole="button" android_ripple={{ color: color["surface-hover"] }} style={styles.row}>
      <CoinMark symbol={asset.symbol} logo={asset.logo} size={28} />
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Text variant="data">{asset.symbol}</Text>
          <View style={[styles.tag, { backgroundColor: above ? color["positive-bg"] : color["negative-bg"] }]}>
            <Text variant="label" tone={above ? "positive" : "negative"}>
              {above ? "Long" : "Short"}
            </Text>
          </View>
        </View>
        <Text variant="label" tone="muted" numberOfLines={1}>
          {above ? "Above" : "Below"} EMA by {Math.abs(distance).toFixed(2)}%
          {row.marketSession && row.marketSession !== "regular" ? ` · ${row.marketSession}` : ""} · {formatRelativeTime(row.publishedAt, now)}
        </Text>
      </View>
      <View style={styles.right}>
        <PriceFlash seq={seq} direction={directionOf(row, previous)}>
          <Text variant="data">{formatPriceUsd(row.price)}</Text>
        </PriceFlash>
        <Delta pct={row.change24hPct} variant="data-sm" reason="No 24h change for this market." />
      </View>
    </Pressable>
  );
}

export function MarketSignals({ market, now }: { market: ReturnType<typeof useMarketSignals>; now: number }) {
  const { feed, rows, resolving } = market;
  return (
    <View>
      {feed.status === "error" && (
        <View style={styles.block}>
          <Notice tone="negative">Latest prices could not refresh. Last good prices stay visible.</Notice>
          <Button label="Retry" size="sm" onPress={refreshPrices} />
        </View>
      )}
      {resolving && rows.length === 0 ? (
        <View accessibilityLabel="Loading market signals">
          {LIVE_MARKETS.slice(0, 5).map((symbol) => (
            <View key={symbol} style={styles.row}>
              <Skeleton width={28} height={28} rounded={radius.pill} />
              <View style={styles.flex}>
                <Skeleton width={90} />
              </View>
              <Skeleton width={70} />
            </View>
          ))}
        </View>
      ) : rows.length > 0 ? (
        rows.map(({ asset, row }) => (
          <MarketRow key={asset.id} asset={asset} row={row} previous={feed.previous.get(asset.id)} seq={feed.seq} now={now} />
        ))
      ) : (
        <View style={styles.empty}>
          <Text variant="body-sm" tone="secondary">
            Live prices are unavailable
          </Text>
          <Text variant="label" tone="muted">
            Check the connection, then retry.
          </Text>
          <Button label="Try again" size="sm" onPress={refreshPrices} />
        </View>
      )}
      <Text variant="label" tone="muted" style={styles.foot}>
        Live price against Pyth EMA · refreshes every 5s · not financial advice.
      </Text>
    </View>
  );
}

/* ---- smart money ---- */

function isSeeded(signal: TrackerSignal): boolean {
  return (signal.configVersion ?? "").startsWith("seed-");
}

function money(value: string | null): string {
  if (value === null) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? formatPriceUsd(number) : value;
}

function quantity(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : value;
}

function SmartMoneyCard({ signal, now, logo }: { signal: TrackerSignal; now: number; logo: { logo: string | null; fallbackLogo: string | null } }) {
  const [open, setOpen] = useState(false);
  const positive = signal.side === "LONG" || signal.side === "ACCUMULATING";
  /* Elyra's own Hyperliquid read: its score is a share of value, and its
     wallets carry 30-day returns, not archetypes. */
  const inApp = signal.source === "hyperliquid";
  const net = signal.participants.reduce((total, participant) => total + Number(participant.quantityDelta), 0).toString();
  return (
    <View style={styles.card}>
      <View style={styles.inline}>
        <CoinMark symbol={signal.symbol} logo={logo.logo} fallbackLogo={logo.fallbackLogo} size={28} />
        <Text variant="data">{signal.symbol}</Text>
        <View style={[styles.tag, { backgroundColor: positive ? color["positive-bg"] : color["negative-bg"] }]}>
          <Text variant="label" tone={positive ? "positive" : "negative"}>
            {signal.side}
          </Text>
        </View>
        {isSeeded(signal) && (
          <View style={[styles.tag, styles.demo]} accessibilityLabel="Seeded demo row — not observed consensus">
            <FlaskConical size={10} strokeWidth={1.5} color={color.accent} />
            <Text variant="label" tone="accent">
              Demo
            </Text>
          </View>
        )}
        <View style={styles.flex} />
        <Text variant="data-sm" tone="muted" numberOfLines={1} style={styles.noShrink}>
          {formatRelativeTime(signal.createdAt, now)}
        </Text>
      </View>
      <Text variant="label" tone="muted">
        {signal.status} · {signal.window}
      </Text>
      <View style={styles.grid}>
        {[
          ["Consensus", `${signal.walletCount} wallets`],
          [inApp ? "Of the money" : "Score", inApp ? `${signal.weightedScore}%` : signal.weightedScore.toFixed(0)],
          ["Price", money(signal.currentPxUsd)],
          ["Avg. entry", `${money(signal.vwapEntryUsd)}${inApp ? "" : ` ${quantity(net)}`}`],
        ].map(([label, value]) => (
          <View key={label} style={styles.cell}>
            <Text variant="label" tone="muted">
              {label}
            </Text>
            <Text variant="data-sm">{value}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={2} style={styles.toggle}>
        <Text variant="label" tone="secondary" style={styles.flex}>
          {open ? "Hide" : "Show"} {signal.participants.length} wallets{inApp ? "" : ` · ${signal.archetypeCount} archetypes`}
        </Text>
        <ChevronDown size={14} strokeWidth={1.5} color={color["text-muted"]} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open &&
        signal.participants.map((participant) => (
          <View key={participant.wallet} style={styles.participant}>
            <Text variant="mono-addr" tone="secondary" numberOfLines={1} ellipsizeMode="middle" style={styles.flex}>
              {participant.wallet}
            </Text>
            <Text variant="label" tone="muted">
              {inApp
                ? `${participant.performance.roiPct}% 30d · ${formatCompactUsd(Number(participant.magnitudeUsd))}`
                : `${participant.archetype} ${participant.score.toFixed(0)} · ${participant.performance.tradeCount} fills`}
            </Text>
          </View>
        ))}
    </View>
  );
}

export function smartHealth(state: SmartMoneyState, now: number): FeedHealth {
  const age = state.fetchedAt === null ? null : now - Date.parse(state.fetchedAt);
  return state.error !== null ? "disconnected" : state.loading ? "loading" : age !== null && age > 3 * 60_000 ? "stale" : "live";
}

export function SmartMoney({ state, now, reload }: { state: SmartMoneyState; now: number; reload: () => void }) {
  const seeded = state.signals.filter(isSeeded).length;
  const symbols = useMemo(() => state.signals.map((signal) => signal.symbol), [state.signals]);
  const logoFor = useTickerLogos(symbols);
  return (
    <View>
      {state.error !== null && (
        <View style={styles.block}>
          <Notice tone="negative">Tracker unavailable. {state.error}</Notice>
          <Button label="Try again" size="sm" onPress={reload} />
        </View>
      )}
      {seeded > 0 && (
        <View style={styles.block}>
          <Notice tone="caution">
            Showing seeded demo signals: {seeded} of {state.signals.length} rows were inserted to demonstrate this feed. Tracked
            wallets and marks are real; the consensus between them is not.
          </Notice>
        </View>
      )}
      {state.loading ? (
        <View style={styles.block} accessibilityLabel="Loading smart money">
          <Skeleton height={96} rounded={radius.card} />
          <Skeleton height={96} rounded={radius.card} />
        </View>
      ) : state.signals.length > 0 ? (
        state.signals.map((signal) => <SmartMoneyCard key={signal.id} signal={signal} now={now} logo={logoFor(signal.symbol)} />)
      ) : (
        state.error === null && (
          /* Said only when the tracker answered: "nothing has fired" is a
             claim about the market. */
          <Text variant="body-sm" tone="secondary" style={styles.empty}>
            No wallet consensus has cleared the tracker&apos;s gates yet.
          </Text>
        )
      )}
      {state.fetchedAt !== null && state.error === null && (
        <Text variant="label" tone="muted" style={styles.foot}>
          Updated {formatRelativeTime(state.fetchedAt, now)}
          {state.notice ? ` · ${state.notice}` : ""}
          {state.disclaimer ? ` ${state.disclaimer}` : ""}
        </Text>
      )}
    </View>
  );
}

/* ---- pulse ---- */

export function WatchlistPulse({ symbols }: { symbols: readonly string[] }) {
  const { bySymbol } = useAssetsBySymbols(symbols);
  const assets = useMemo(() => symbols.flatMap((symbol) => bySymbol.get(symbol) ?? []), [symbols, bySymbol]);
  const feed = usePrices(useMemo(() => assets.map((asset) => asset.id), [assets]));
  if (assets.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="eyebrow" tone="muted">
        Your watchlist · live
      </Text>
      <View style={styles.boxed}>
        {assets.map((asset) => {
          const row = feed.rows.get(asset.id);
          const range =
            row && row.high24h !== null && row.low24h !== null && row.high24h > row.low24h
              ? Math.min(Math.max((row.price - row.low24h) / (row.high24h - row.low24h), 0), 1)
              : null;
          const ema = row && row.emaPrice > 0 ? ((row.price - row.emaPrice) / row.emaPrice) * 100 : null;
          return (
            <Pressable key={asset.id} onPress={() => openAsset(asset)} accessibilityRole="button" style={styles.pulseRow}>
              <CoinMark symbol={asset.symbol} logo={asset.logo} size={26} />
              <View style={styles.flex}>
                <View style={styles.between}>
                  <Text variant="data">{asset.symbol}</Text>
                  <Text variant="data">{row ? formatPriceUsd(row.price) : "—"}</Text>
                </View>
                <View style={styles.inline}>
                  {/* Where the price sits between today's low and high. */}
                  <View
                    accessibilityLabel={range === null ? "24h range unavailable" : `${Math.round(range * 100)}% up its 24h range`}
                    style={styles.track}
                  >
                    {range !== null && <View style={[styles.marker, { left: `${range * 100}%` }]} />}
                  </View>
                  <Delta pct={row?.change24hPct ?? null} variant="data-sm" reason="No 24h change." />
                </View>
                {ema !== null && (
                  <Text variant="label" tone="muted">
                    {formatPct(Math.abs(ema), { sign: false })} {ema >= 0 ? "above" : "below"} its EMA
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type BoardView = "gainers" | "losers" | "funding" | "openInterest" | "volume";

const VIEWS: { id: BoardView; label: string }[] = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "funding", label: "Funding" },
  { id: "openInterest", label: "Open interest" },
  { id: "volume", label: "Volume" },
];

function metric(view: BoardView, row: PulseRow): number {
  switch (view) {
    case "gainers":
    case "losers":
      return row.change24hPct ?? 0;
    case "funding":
      return row.fundingAprPct ?? 0;
    case "openInterest":
      return row.openInterestUsd ?? 0;
    case "volume":
      return row.volume24hUsd ?? 0;
  }
}

/* The server ranks only rows that have the figure (lib/market/pulse.ts), so
   a null here should not happen — and if it does it reads as a dash, never
   as $0. */
function metricText(view: BoardView, row: PulseRow): string {
  const missing = "—";
  switch (view) {
    case "gainers":
    case "losers":
      return row.change24hPct === null ? missing : formatPct(row.change24hPct, { decimals: 1 });
    case "funding":
      return row.fundingAprPct === null ? missing : `${formatPct(row.fundingAprPct, { decimals: 1 })} APR`;
    case "openInterest":
      return row.openInterestUsd === null ? missing : formatCompactUsd(row.openInterestUsd);
    case "volume":
      return row.volume24hUsd === null ? missing : formatCompactUsd(row.volume24hUsd);
  }
}

export function PulseBoard({ pulse }: { pulse: { data: import("@/lib/market/pulse").PulseResponse | null; failed: boolean } }) {
  const [view, setView] = useState<BoardView>("gainers");
  const board = pulse.data?.pulse ?? null;
  const rows = useMemo(() => {
    if (board === null) return [];
    if (view === "funding") return [...board.fundingHigh.slice(0, 5), ...board.fundingLow.slice(0, 5)];
    return board[view];
  }, [board, view]);
  const symbols = useMemo(
    () => (board ? [...new Set(Object.values(board).flatMap((value) => (Array.isArray(value) ? value.map((row: PulseRow) => row.symbol) : [])))] : []),
    [board],
  );
  const logoFor = useTickerLogos(symbols);
  const { bySymbol } = useAssetsBySymbols(symbols);
  const max = Math.max(1e-9, ...rows.map((row) => Math.abs(metric(view, row))));
  const firstShortPays = view === "funding" ? rows.findIndex((row) => (row.fundingAprPct ?? 0) < 0) : -1;

  return (
    <View style={styles.section}>
      <View style={styles.between}>
        <Text variant="eyebrow" tone="muted">
          Hyperliquid board
        </Text>
        {board && (
          <Text variant="label" tone="muted" numberOfLines={1} style={styles.shrink}>
            {board.markets} perps · {formatCompactUsd(board.totalOpenInterestUsd)} OI
          </Text>
        )}
      </View>
      <View style={styles.views}>
        {VIEWS.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => setView(entry.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: view === entry.id }}
            hitSlop={6}
            style={[styles.viewChip, view === entry.id && styles.viewChipOn]}
          >
            <Text variant="label" tone={view === entry.id ? "primary" : "secondary"}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {board === null ? (
        pulse.failed ? (
          <Text variant="body-sm" tone="secondary">
            Hyperliquid could not be read just now.
          </Text>
        ) : (
          <View accessibilityLabel="Loading the board" style={styles.block}>
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={40} />
            ))}
          </View>
        )
      ) : rows.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          Nothing stretched right now — every liquid market is near the resting rate.
        </Text>
      ) : (
        <View style={styles.boxed}>
          {rows.map((row, index) => {
            const value = metric(view, row);
            const tone = view === "openInterest" || view === "volume" ? "primary" : value >= 0 ? "positive" : "negative";
            const asset = bySymbol.get(row.symbol.toUpperCase());
            const mark = logoFor(row.symbol);
            return (
              <View key={`${view}-${row.symbol}`}>
                {view === "funding" && index === 0 && (row.fundingAprPct ?? 0) > 0 && (
                  <Text variant="label" tone="muted" style={styles.groupLabel}>
                    Longs paying most
                  </Text>
                )}
                {index === firstShortPays && (
                  <Text variant="label" tone="muted" style={styles.groupLabel}>
                    Shorts paying most
                  </Text>
                )}
                <Pressable
                  onPress={() => (asset ? openAsset(asset) : router.push({ pathname: "/search", params: { q: row.symbol } }))}
                  accessibilityRole="button"
                  accessibilityHint={asset ? `Opens ${row.symbol}` : `Searches for ${row.symbol}`}
                  style={styles.boardRow}
                >
                  {/* The row's share of the list's largest value, as a fill. */}
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${(Math.abs(value) / max) * 100}%`,
                        backgroundColor:
                          tone === "positive" ? color["positive-bg"] : tone === "negative" ? color["negative-bg"] : color["surface-raised"],
                      },
                    ]}
                  />
                  <Text variant="data-sm" tone="muted" style={styles.rank}>
                    {index + 1}
                  </Text>
                  <CoinMark symbol={row.symbol} logo={mark.logo} fallbackLogo={mark.fallbackLogo} size={24} />
                  <View style={styles.flex}>
                    <Text variant="data">{row.symbol}</Text>
                    <Text variant="label" tone="muted" numberOfLines={1}>
                      {formatPriceUsd(row.markPrice)}
                      {view !== "gainers" && view !== "losers" && row.change24hPct !== null ? ` · ${formatPct(row.change24hPct, { decimals: 1 })} 24h` : ""}
                      {row.maxLeverage ? ` · ${row.maxLeverage}x` : ""}
                    </Text>
                  </View>
                  <Text variant="data" tone={tone}>
                    {metricText(view, row)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      <Text variant="label" tone="muted">
        Movers and funding rank markets with over $1M of 24h volume. Funding is annualised from Hyperliquid&apos;s hourly rate.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  noShrink: { flexShrink: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  feedLine: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  right: { alignItems: "flex-end" },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  demo: { borderWidth: 1, borderColor: color["accent-quiet"] },
  block: { gap: 8, paddingVertical: 8 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 24, textAlign: "center" },
  foot: { paddingVertical: 10 },
  card: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
    padding: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
  cell: { width: "50%" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  participant: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 2 },
  section: { gap: 8, paddingVertical: 12 },
  boxed: { borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"], overflow: "hidden" },
  pulseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  track: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color["surface-hover"] },
  marker: { position: "absolute", top: -3, width: 2, height: 10, marginLeft: -1, backgroundColor: color["text-primary"] },
  views: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  viewChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    justifyContent: "center",
  },
  viewChipOn: { borderColor: color["accent-quiet"], backgroundColor: color["surface-active"] },
  groupLabel: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: color["surface-raised"] },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0 },
  rank: { width: 18 },
});
