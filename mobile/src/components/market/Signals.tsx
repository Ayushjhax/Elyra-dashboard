import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown, FlaskConical } from "lucide-react-native";
import { formatCompactUsd, formatPct, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import type { PulseResponse, PulseRow } from "@/lib/market/pulse";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import type { TrackerSignal } from "@/lib/tracker/types";
import { ChangeBadge, FilterChips, HealthTag, SectionLabel, panel, polledHealth, priceHealth, type FeedHealth } from "~/components/market/parts";
import { PriceFlash } from "~/components/market/PriceFlash";
import { Button } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { Notice } from "~/components/wallet/parts";
import { directionOf, refreshPrices, useAssets, useAssetsBySymbols, usePrices, useTickerLogos } from "~/lib/stores/market";
import type { SmartMoneyState } from "~/lib/stores/signals";
import { fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Live signals — the website's SignalsWidget and MarketPulse, for a phone.

   MARKET is arithmetic on the live Pyth feed: where each market's price
   sits against its EMA. SMART MONEY is wallet consensus from the tracker,
   or Elyra's own read of Hyperliquid when the tracker is not running. They
   answer different questions with different evidence, so they stay two
   views, each with its own state in words. PULSE is the account's
   watchlist, live, and the Hyperliquid board.

   A seeded demo row is marked on the card itself, not only in a banner: a
   consensus that was never observed must not pass for one that was.
--------------------------------------------------------------------------- */

export type { FeedHealth };

/** The source and freshness of the feed on screen. */
export function FeedLine({ state, at, now, source }: { state: FeedHealth; at: string | null; now: number; source: string | null }) {
  return (
    <View style={styles.feedLine}>
      <HealthTag health={state} />
      <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.flex}>
        {source ? `· ${source}` : ""}
      </Text>
      {at !== null && (
        <Text variant="body-sm" tone="muted" numberOfLines={1}>
          Updated {formatRelativeTime(at, now)}
        </Text>
      )}
    </View>
  );
}

function openAsset(asset: PythAsset) {
  router.push({ pathname: "/asset/[symbol]", params: { symbol: asset.symbol, id: String(asset.id) } });
}

/** Distance of the price from Pyth's EMA, in percent; null without an EMA. */
function emaDistance(row: PriceRow | undefined): number | null {
  return row && row.emaPrice > 0 ? ((row.price - row.emaPrice) / row.emaPrice) * 100 : null;
}

function LoadingRows({ count, label }: { count: number; label: string }) {
  return (
    <View accessibilityLabel={label} style={panel.box}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.row, index > 0 && panel.rule]}>
          <Skeleton width={40} height={40} rounded={radius.pill} />
          <View style={styles.flex}>
            <Skeleton width={90} />
          </View>
          <Skeleton width={70} />
        </View>
      ))}
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
  const health = priceHealth(feed.status, rows.length > 0);
  return { feed, rows, resolving, health };
}

/** A side tag: the word carries the meaning, the tint repeats it. */
function SideTag({ side }: { side: string }) {
  const positive = side === "LONG" || side === "ACCUMULATING" || side === "Long";
  return (
    <View style={[styles.tag, { backgroundColor: positive ? color["positive-bg"] : color["negative-bg"] }]}>
      <Text variant="label" tone={positive ? "positive" : "negative"} style={styles.tagText}>
        {side.toUpperCase()}
      </Text>
    </View>
  );
}

function MarketRow({
  asset,
  row,
  previous,
  seq,
  now,
  first,
}: {
  asset: PythAsset;
  row: PriceRow;
  previous: number | undefined;
  seq: number;
  now: number;
  first: boolean;
}) {
  const distance = emaDistance(row) ?? 0;
  const above = distance >= 0;
  return (
    <Pressable
      onPress={() => openAsset(asset)}
      accessibilityRole="button"
      accessibilityHint="Opens the chart"
      android_ripple={{ color: color["surface-hover"] }}
      style={[styles.row, !first && panel.rule]}
    >
      <CoinMark symbol={asset.symbol} logo={asset.logo} size={40} />
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Text variant="data" style={styles.ticker}>
            {asset.symbol}
          </Text>
          <SideTag side={above ? "Long" : "Short"} />
        </View>
        <Text variant="body-sm" tone="muted" numberOfLines={1}>
          {above ? "Above" : "Below"} EMA by {Math.abs(distance).toFixed(2)}%
          {row.marketSession && row.marketSession !== "regular" ? ` · ${row.marketSession}` : ""} · {formatRelativeTime(row.publishedAt, now)}
        </Text>
      </View>
      <View style={styles.right}>
        <PriceFlash seq={seq} direction={directionOf(row, previous)}>
          <Text variant="data" style={styles.price}>
            {formatPriceUsd(row.price)}
          </Text>
        </PriceFlash>
        <Delta pct={row.change24hPct} variant="data" reason="No 24h change for this market." />
      </View>
    </Pressable>
  );
}

export function MarketSignals({ market, now }: { market: ReturnType<typeof useMarketSignals>; now: number }) {
  const { feed, rows, resolving } = market;
  return (
    <View style={styles.stack}>
      <Text variant="body" tone="secondary">
        Where each market trades against its Pyth EMA.
      </Text>
      {feed.status === "error" && (
        <View style={styles.block}>
          <Notice tone="negative">Latest prices could not refresh. Last good prices stay visible.</Notice>
          <Button label="Retry" size="sm" onPress={refreshPrices} />
        </View>
      )}
      {resolving && rows.length === 0 ? (
        <LoadingRows count={5} label="Loading market signals" />
      ) : rows.length > 0 ? (
        <View style={panel.box}>
          {rows.map(({ asset, row }, index) => (
            <MarketRow key={asset.id} asset={asset} row={row} previous={feed.previous.get(asset.id)} seq={feed.seq} now={now} first={index === 0} />
          ))}
        </View>
      ) : (
        <View style={[panel.box, styles.empty]}>
          <Text variant="body" tone="secondary">
            Live prices are unavailable
          </Text>
          <Text variant="body-sm" tone="muted">
            Check the connection, then retry.
          </Text>
          <Button label="Try again" size="sm" onPress={refreshPrices} />
        </View>
      )}
      <Text variant="body-sm" tone="muted">
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

/**
 * Elyra's Hyperliquid read writes `status` as "N of M wallets": N on the
 * called side, M holding the market at all (lib/smartmoney/hyperliquid.ts).
 * Anything else is the tracker's own status word and is shown as it is.
 */
const COHORT_STATUS = /^(\d+) of (\d+) wallets$/;

function summary(signal: TrackerSignal): { full: string; short: string } {
  const inApp = signal.source === "hyperliquid";
  const side = signal.side.toLowerCase();
  if (inApp && COHORT_STATUS.test(signal.status)) {
    return {
      full: `${signal.status} hold ${side} positions.`,
      short: `${signal.status} · ${signal.weightedScore}% of the value`,
    };
  }
  return {
    full: `${signal.status} · ${signal.window}`,
    short: `${signal.walletCount} wallets · score ${signal.weightedScore.toFixed(0)}`,
  };
}

function SmartMoneyCard({
  signal,
  now,
  logo,
  initiallyOpen,
}: {
  signal: TrackerSignal;
  now: number;
  logo: { logo: string | null; fallbackLogo: string | null };
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [walletsOpen, setWalletsOpen] = useState(false);
  /* Elyra's own Hyperliquid read: its score is a share of value, and its
     wallets carry 30-day returns, not archetypes. */
  const inApp = signal.source === "hyperliquid";
  const net = signal.participants.reduce((total, participant) => total + Number(participant.quantityDelta), 0).toString();
  const text = summary(signal);
  const listed = signal.participants.length;
  /* The read lists at most the ten largest positions; say so when that is fewer than the consensus. */
  const walletsLabel = inApp
    ? listed < signal.walletCount
      ? `View the largest ${listed} of ${signal.walletCount} wallets`
      : `View ${listed} ${listed === 1 ? "wallet" : "wallets"}`
    : `View ${listed} wallets · ${signal.archetypeCount} archetypes`;

  const cells: { label: string; value: string; tip?: string }[] = [
    { label: "Consensus", value: `${signal.walletCount} ${signal.walletCount === 1 ? "wallet" : "wallets"}` },
    inApp
      ? {
          label: "Value on this side",
          value: `${signal.weightedScore}%`,
          tip: `Of the dollar value the tracked wallets hold in ${signal.symbol}, the share that is ${signal.side.toLowerCase()}. A ratio of observed positions, not a confidence or a forecast.`,
        }
      : { label: "Score", value: signal.weightedScore.toFixed(0) },
    { label: "Current price", value: money(signal.currentPxUsd) },
    {
      label: "Average entry",
      value: `${money(signal.vwapEntryUsd)}${inApp ? "" : ` ${quantity(net)}`}`,
      tip: inApp ? "The wallets' entry prices on this side, weighted by each position's value." : undefined,
    },
  ];

  return (
    <View style={[panel.box, styles.card]}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${signal.symbol}, ${signal.side.toLowerCase()}, ${text.full}`}
        accessibilityHint={open ? "Collapses the card" : "Shows the figures"}
        style={styles.cardHead}
      >
        <CoinMark symbol={signal.symbol} logo={logo.logo} fallbackLogo={logo.fallbackLogo} size={40} />
        <View style={styles.flex}>
          <View style={styles.inline}>
            <Text variant="data" style={styles.cardTicker}>
              {signal.symbol}
            </Text>
            <SideTag side={signal.side} />
            {isSeeded(signal) && (
              <View style={[styles.tag, styles.demo]} accessibilityLabel="Seeded demo row — not observed consensus">
                <FlaskConical size={10} strokeWidth={1.5} color={color.accent} />
                <Text variant="label" tone="accent">
                  Demo
                </Text>
              </View>
            )}
            <View style={styles.flex} />
            <Text variant="body-sm" tone="muted" numberOfLines={1} style={styles.noShrink}>
              {formatRelativeTime(signal.createdAt, now)}
            </Text>
          </View>
          {!open && (
            <View style={styles.inline}>
              <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.flex}>
                {text.short}
              </Text>
              <ChevronDown size={18} strokeWidth={1.5} color={color["text-secondary"]} />
            </View>
          )}
        </View>
      </Pressable>

      {open && (
        <>
          <Text variant="body" tone="secondary" style={styles.cardSummary}>
            {text.full}
          </Text>
          <View style={styles.grid}>
            {cells.map((cell, index) => (
              <View key={cell.label} style={[styles.cell, index % 2 === 1 && styles.cellRight, index >= 2 && styles.cellLower]}>
                <View style={styles.inline}>
                  <Text variant="body-sm" tone="muted" numberOfLines={1} style={styles.shrink}>
                    {cell.label}
                  </Text>
                  {cell.tip !== undefined && <InfoTip label={`About ${cell.label.toLowerCase()}`} text={cell.tip} />}
                </View>
                <Text variant="data" style={styles.cellValue}>
                  {cell.value}
                </Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => setWalletsOpen(!walletsOpen)}
            accessibilityRole="button"
            accessibilityState={{ expanded: walletsOpen }}
            style={({ pressed }) => [styles.toggle, panel.rule, pressed && { opacity: 0.7 }]}
          >
            <Text variant="body" style={styles.flex}>
              {walletsOpen ? "Hide wallets" : walletsLabel}
            </Text>
            <ChevronDown size={18} strokeWidth={1.5} color={color["text-secondary"]} style={{ transform: [{ rotate: walletsOpen ? "180deg" : "0deg" }] }} />
          </Pressable>
          {walletsOpen && (
            <View style={styles.wallets}>
              {signal.participants.map((participant) => {
                const roi = Number(participant.performance.roiPct);
                return (
                  <View key={participant.wallet} style={styles.participant}>
                    <Text variant="mono-addr" tone="secondary" numberOfLines={1} ellipsizeMode="middle" style={styles.flex}>
                      {participant.wallet}
                    </Text>
                    <Text variant="data-sm" tone="muted" style={styles.noShrink}>
                      {inApp
                        ? `${Number.isFinite(roi) ? formatPct(roi, { decimals: 1 }) : `${participant.performance.roiPct}%`} 30d · ${formatCompactUsd(Number(participant.magnitudeUsd))}`
                        : `${participant.archetype} ${participant.score.toFixed(0)} · ${participant.performance.tradeCount} fills`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function smartHealth(state: SmartMoneyState, now: number): FeedHealth {
  return polledHealth({
    /* A failed read with nothing to show is disconnected, not stale. */
    hasData: !state.loading && state.fetchedAt !== null && (state.error === null || state.signals.length > 0),
    failed: state.error !== null,
    at: state.fetchedAt,
    now,
    staleAfterMs: 3 * 60_000,
  });
}

export function SmartMoney({ state, now, reload }: { state: SmartMoneyState; now: number; reload: () => void }) {
  const seeded = state.signals.filter(isSeeded).length;
  const symbols = useMemo(() => state.signals.map((signal) => signal.symbol), [state.signals]);
  const logoFor = useTickerLogos(symbols);
  return (
    <View style={styles.stack}>
      <Text variant="body" tone="secondary">
        Positioning across tracked wallets.
      </Text>
      {state.error !== null && (
        <View style={styles.block}>
          <Notice tone="negative">Tracker unavailable. {state.error}</Notice>
          <Button label="Try again" size="sm" onPress={reload} />
        </View>
      )}
      {seeded > 0 && (
        <Notice tone="caution">
          Showing seeded demo signals: {seeded} of {state.signals.length} rows were inserted to demonstrate this feed. Tracked
          wallets and marks are real; the consensus between them is not.
        </Notice>
      )}
      {state.loading ? (
        <View style={styles.block} accessibilityLabel="Loading smart money">
          <Skeleton height={180} rounded={radius.sheet} />
          <Skeleton height={72} rounded={radius.sheet} />
        </View>
      ) : state.signals.length > 0 ? (
        state.signals.map((signal, index) => (
          <SmartMoneyCard key={signal.id} signal={signal} now={now} logo={logoFor(signal.symbol)} initiallyOpen={index < 2} />
        ))
      ) : (
        state.error === null && (
          /* Said only when the tracker answered: "nothing has fired" is a
             claim about the market. */
          <View style={[panel.box, styles.empty]}>
            <Text variant="body" tone="secondary">
              No wallet consensus has cleared the tracker&apos;s gates yet.
            </Text>
          </View>
        )
      )}
      {state.fetchedAt !== null && state.error === null && (state.notice || state.disclaimer) && (
        <Text variant="body-sm" tone="muted">
          {state.notice ?? ""}
          {state.notice && state.disclaimer ? " " : ""}
          {state.disclaimer ?? ""}
        </Text>
      )}
    </View>
  );
}

/* ---- pulse ---- */

export function WatchlistPulse({ symbols }: { symbols: readonly string[] }) {
  const { bySymbol, resolved } = useAssetsBySymbols(symbols);
  const assets = useMemo(() => symbols.flatMap((symbol) => bySymbol.get(symbol) ?? []), [symbols, bySymbol]);
  const feed = usePrices(useMemo(() => assets.map((asset) => asset.id), [assets]));
  const health = priceHealth(feed.status, feed.rows.size > 0);
  const resolving = symbols.some((symbol) => !resolved.has(symbol)) && assets.length === 0;

  return (
    <View style={styles.section}>
      <SectionLabel label="Watchlist pulse" health={symbols.length > 0 ? health : undefined} />
      {symbols.length === 0 ? (
        <View style={[panel.box, styles.empty]}>
          <Text variant="body" tone="secondary">
            Add markets to your watchlist to see their pulse here.
          </Text>
        </View>
      ) : resolving ? (
        <LoadingRows count={Math.min(symbols.length, 3)} label="Loading the watchlist pulse" />
      ) : (
        <View style={panel.box}>
          {assets.map((asset, index) => {
            const row = feed.rows.get(asset.id);
            const range =
              row && row.high24h !== null && row.low24h !== null && row.high24h > row.low24h
                ? Math.min(Math.max((row.price - row.low24h) / (row.high24h - row.low24h), 0), 1)
                : null;
            const ema = emaDistance(row);
            return (
              <Pressable
                key={asset.id}
                onPress={() => openAsset(asset)}
                accessibilityRole="button"
                accessibilityHint="Opens the chart"
                android_ripple={{ color: color["surface-hover"] }}
                style={[styles.row, index > 0 && panel.rule]}
              >
                <CoinMark symbol={asset.symbol} logo={asset.logo} size={40} />
                <View style={styles.flex}>
                  <Text variant="data" style={styles.ticker}>
                    {asset.symbol}
                  </Text>
                  <Text variant="body-sm" tone="muted" numberOfLines={1}>
                    {ema === null
                      ? row
                        ? "EMA unavailable"
                        : "Waiting for a price"
                      : `${formatPct(Math.abs(ema), { sign: false })} ${ema >= 0 ? "above" : "below"} its EMA`}
                  </Text>
                </View>
                <View style={styles.right}>
                  {row ? (
                    <PriceFlash seq={feed.seq} direction={directionOf(row, feed.previous.get(asset.id))}>
                      <Text variant="data" style={styles.price}>
                        {formatPriceUsd(row.price)}
                      </Text>
                    </PriceFlash>
                  ) : (
                    <Skeleton width={72} />
                  )}
                  <Delta pct={row?.change24hPct ?? null} variant="data" reason="No 24h change." />
                  {/* Where the price sits between today's low and high. */}
                  {range !== null && (
                    <View accessibilityLabel={`${Math.round(range * 100)}% up its 24h range`} style={styles.track}>
                      <View style={[styles.marker, { left: `${range * 100}%` }]} />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type BoardView = "gainers" | "losers" | "funding" | "openInterest" | "volume";

const VIEWS: { value: BoardView; label: string }[] = [
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
  { value: "funding", label: "Funding" },
  { value: "openInterest", label: "OI" },
  { value: "volume", label: "Volume" },
];

const HEADING: Record<BoardView, { title: string; column: string; noun: string }> = {
  gainers: { title: "Top gainers", column: "24h change", noun: "gainers" },
  losers: { title: "Top losers", column: "24h change", noun: "losers" },
  funding: { title: "Funding extremes", column: "Funding APR", noun: "markets" },
  openInterest: { title: "Largest open interest", column: "Open interest", noun: "markets" },
  volume: { title: "Most traded", column: "24h volume", noun: "markets" },
};

/** Rows shown before "View all". */
const FOLD = 5;

/* The server ranks only rows that have the figure (lib/market/pulse.ts), so
   a null here should not happen — and if it does it reads as a dash, never
   as $0. */
function BoardFigure({ view, row }: { view: BoardView; row: PulseRow }) {
  switch (view) {
    case "gainers":
    case "losers":
      return <ChangeBadge pct={row.change24hPct} decimals={1} reason="No 24h change for this market." />;
    case "funding": {
      const apr = row.fundingAprPct;
      if (apr === null) return <ChangeBadge pct={null} reason="No funding rate for this market." />;
      return (
        <View style={[styles.figure, { backgroundColor: apr >= 0 ? color["positive-bg"] : color["negative-bg"] }]}>
          <Text variant="data" tone={apr >= 0 ? "positive" : "negative"}>
            {formatPct(apr, { decimals: 1 })}
          </Text>
        </View>
      );
    }
    case "openInterest":
    case "volume": {
      const value = view === "openInterest" ? row.openInterestUsd : row.volume24hUsd;
      return (
        <View style={[styles.figure, styles.figurePlain]}>
          <Text variant="data" tone={value === null ? "muted" : "primary"}>
            {value === null ? "—" : formatCompactUsd(value)}
          </Text>
        </View>
      );
    }
  }
}

export function PulseBoard({ pulse, now }: { pulse: { data: PulseResponse | null; failed: boolean; reload: () => void }; now: number }) {
  const [view, setView] = useState<BoardView>("gainers");
  const [expanded, setExpanded] = useState(false);
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
  const firstShortPays = view === "funding" ? rows.findIndex((row) => (row.fundingAprPct ?? 0) < 0) : -1;
  /* Funding is already five a side; the fold is for the single-sided lists. */
  const folds = view !== "funding" && rows.length > FOLD;
  const shown = folds && !expanded ? rows.slice(0, FOLD) : rows;
  const health = polledHealth({ hasData: board !== null, failed: pulse.failed, at: board?.asOf ?? null, now, staleAfterMs: 3 * 60_000 });
  const heading = HEADING[view];

  return (
    <View style={styles.section}>
      <SectionLabel
        label="Hyperliquid"
        health={health === "live" ? undefined : health}
        right={
          board && (
            <Text variant="body-sm" tone="muted" numberOfLines={1} style={styles.shrink}>
              {board.markets} perps · {formatCompactUsd(board.totalOpenInterestUsd)} open interest
            </Text>
          )
        }
      />
      <FilterChips<BoardView>
        accessibilityLabel="Rank Hyperliquid markets by"
        chips={VIEWS}
        value={view}
        onChange={(next) => {
          setView(next);
          setExpanded(false);
        }}
      />
      <View style={styles.boardHead}>
        <Text variant="h2" accessibilityRole="header" style={styles.boardTitle}>
          {heading.title}
        </Text>
        <Text variant="body-sm" tone="muted">
          {heading.column}
        </Text>
      </View>
      {board === null ? (
        pulse.failed ? (
          <View style={[panel.box, styles.empty]}>
            <Text variant="body" tone="secondary">
              Hyperliquid could not be read just now.
            </Text>
            <Button label="Try again" size="sm" onPress={pulse.reload} />
          </View>
        ) : (
          <LoadingRows count={5} label="Loading the board" />
        )
      ) : rows.length === 0 ? (
        <View style={[panel.box, styles.empty]}>
          <Text variant="body" tone="secondary">
            {view === "funding"
              ? "Nothing stretched right now — every liquid market is near the resting rate."
              : view === "gainers"
                ? "No liquid market is up over 24 hours."
                : view === "losers"
                  ? "No liquid market is down over 24 hours."
                  : "Hyperliquid returned no markets."}
          </Text>
        </View>
      ) : (
        <>
          <View style={panel.box}>
            {shown.map((row, index) => {
              const asset = bySymbol.get(row.symbol.toUpperCase());
              const mark = logoFor(row.symbol);
              return (
                <View key={`${view}-${row.symbol}`}>
                  {view === "funding" && index === 0 && (row.fundingAprPct ?? 0) > 0 && (
                    <Text variant="body-sm" tone="muted" style={styles.groupLabel}>
                      Longs paying most
                    </Text>
                  )}
                  {index === firstShortPays && (
                    <Text variant="body-sm" tone="muted" style={[styles.groupLabel, index > 0 && panel.rule]}>
                      Shorts paying most
                    </Text>
                  )}
                  <Pressable
                    onPress={() => (asset ? openAsset(asset) : router.push({ pathname: "/search", params: { q: row.symbol } }))}
                    accessibilityRole="button"
                    accessibilityHint={asset ? `Opens ${row.symbol}` : `Searches for ${row.symbol}`}
                    android_ripple={{ color: color["surface-hover"] }}
                    style={[styles.row, (index > 0 || view === "funding") && panel.rule]}
                  >
                    <Text variant="data" tone="secondary" style={styles.rank}>
                      {index + 1}
                    </Text>
                    <CoinMark symbol={row.symbol} logo={mark.logo} fallbackLogo={mark.fallbackLogo} size={40} />
                    <View style={styles.flex}>
                      <Text variant="data" style={styles.ticker} numberOfLines={1}>
                        {row.symbol}
                      </Text>
                      <Text variant="body-sm" tone="muted" numberOfLines={1}>
                        {formatPriceUsd(row.markPrice)}
                        {view !== "gainers" && view !== "losers" && row.change24hPct !== null ? ` · ${formatPct(row.change24hPct, { decimals: 1 })} 24h` : ""}
                        {row.maxLeverage ? ` · ${row.maxLeverage}x` : ""}
                      </Text>
                    </View>
                    <BoardFigure view={view} row={row} />
                  </Pressable>
                </View>
              );
            })}
          </View>
          {folds && (
            <Pressable
              onPress={() => setExpanded(!expanded)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={({ pressed }) => [panel.box, styles.more, pressed && { opacity: 0.7 }]}
            >
              <Text variant="body" tone="accent" style={styles.moreLabel}>
                {expanded ? `Show the top ${FOLD}` : `View all ${rows.length} ${heading.noun}`}
              </Text>
              <ChevronDown size={18} strokeWidth={1.5} color={color.accent} style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
            </Pressable>
          )}
        </>
      )}
      <Text variant="body-sm" tone="muted">
        Movers and funding rank markets with over $1M of 24h volume. Funding is annualised from Hyperliquid&apos;s hourly rate.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  noShrink: { flexShrink: 0 },
  stack: { gap: 12 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingHorizontal: 16, paddingVertical: 10 },
  right: { alignItems: "flex-end", gap: 2 },
  ticker: { fontSize: 16, lineHeight: 22 },
  price: { fontFamily: fontFamily("sans", 600), fontSize: 16, lineHeight: 22 },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { letterSpacing: 0.4 },
  demo: { borderWidth: 1, borderColor: color["accent-quiet"] },
  block: { gap: 8 },
  empty: { alignItems: "center", gap: 8, padding: 24 },
  card: { paddingBottom: 0 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  cardTicker: { fontSize: 18, lineHeight: 24 },
  cardSummary: { paddingHorizontal: 16, paddingBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  cell: { width: "50%", paddingVertical: 12, paddingRight: 12, gap: 2 },
  cellRight: { paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-subtle"] },
  cellLower: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  cellValue: { fontSize: 16, lineHeight: 22 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET + 8, marginHorizontal: 16 },
  wallets: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  participant: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  section: { gap: 14, paddingTop: 20 },
  track: { width: 64, height: 3, marginTop: 4, borderRadius: radius.pill, backgroundColor: color["surface-hover"] },
  marker: { position: "absolute", top: -3, width: 2, height: 9, marginLeft: -1, backgroundColor: color["text-primary"] },
  boardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingTop: 4 },
  boardTitle: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26 },
  groupLabel: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: color["surface-raised"] },
  rank: { width: 20, textAlign: "center" },
  figure: { minWidth: 72, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.control, alignItems: "center" },
  figurePlain: { backgroundColor: color["surface-raised"] },
  more: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingHorizontal: 16 },
  moreLabel: { flex: 1, fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
});
