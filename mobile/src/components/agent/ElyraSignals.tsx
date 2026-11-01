import { useMemo, useState } from "react";
import { Text as NativeText, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, ChevronUp, CircleAlert, Info, Minus, Sparkles } from "lucide-react-native";
import { signalPrompt } from "@/lib/agent/suggestions";
import { formatCompactUsd, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import type { MarketSignal } from "@/lib/research/signalTypes";
import type { TrackerSignal } from "@/lib/tracker/types";
import { SerifHeading } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { useAppStore } from "~/lib/store";
import { useAssets, useAssetsBySymbols, useTickerLogos } from "~/lib/stores/market";
import { useElyraSignals, useSmartMoney } from "~/lib/stores/signals";
import { useWatchlist } from "~/lib/stores/watchlist";
import { useMinute } from "~/lib/useClock";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Elyra's signals — the website's ElyraSignals, in the Elyra tab.

   MARKET SIGNALS are lib/research/signals.ts on the selected market and the
   watchlist: a move, a funding dislocation, a gap between venues, each with
   the readings behind it and anything pointing the other way. Strength is
   earned by corroboration, never asserted, and "nothing notable" is said
   plainly. SMART-MONEY CONSENSUS is where the most profitable Hyperliquid
   wallets agree. Each can be taken to the agent with "Ask Elyra".

   A signal's headline and its counterpoints are the server's own words
   (lib/research/signals.ts); the card shows them, it does not reinterpret
   them. The consensus share is the cohort's money on that side of the
   market — a ratio of observed position values (lib/smartmoney/
   hyperliquid.ts), not a wallet count, not a confidence. The list shows
   the busiest four, and the rest of the same read on request.

   Observations from live data, not recommendations.
--------------------------------------------------------------------------- */

const MAX_SYMBOLS = 6;
const CONSENSUS_SHOWN = 12;
const CONSENSUS_PREVIEW = 4;

const STRENGTH: Record<MarketSignal["strength"], { label: string; border: string; tone: "primary" | "secondary" | "muted" }> = {
  high: { label: "High", border: color["accent-quiet"], tone: "primary" },
  medium: { label: "Medium", border: color["border-strong"], tone: "secondary" },
  low: { label: "Low", border: color["border-subtle"], tone: "muted" },
};

function DirectionIcon({ direction }: { direction: MarketSignal["direction"] }) {
  if (direction === "positive") return <ArrowUpRight size={22} strokeWidth={1.75} color={color.positive} accessibilityLabel="Up" />;
  if (direction === "negative") return <ArrowDownRight size={22} strokeWidth={1.75} color={color.negative} accessibilityLabel="Down" />;
  return <Minus size={22} strokeWidth={1.75} color={color["neutral-flat"]} accessibilityLabel="Flat" />;
}

function AskButton({ label = "Ask Elyra", onPress }: { label?: string; onPress: () => void }) {
  return <Button label={label} size="sm" variant="ghost" icon={<Sparkles size={12} strokeWidth={1.5} color={color["agent-accent"]} />} onPress={onPress} />;
}

function SignalCard({ signal, now, logo, onAsk }: { signal: MarketSignal; now: number; logo: string | null; onAsk: (prompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const strength = STRENGTH[signal.strength];
  const headTone = signal.direction === "positive" ? "positive" : signal.direction === "negative" ? "negative" : "primary";
  return (
    <View style={styles.card}>
      <View style={styles.inline}>
        <CoinMark symbol={signal.symbol} logo={logo} size={44} />
        <Text variant="body" style={styles.symbol}>
          {signal.symbol}
        </Text>
        <View style={[styles.strength, { borderColor: strength.border }]}>
          <Text variant="body-sm" tone={strength.tone}>
            Strength: {strength.label}
          </Text>
        </View>
        <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.end}>
          {formatRelativeTime(signal.generatedAt, now)}
        </Text>
      </View>
      <View style={styles.headline}>
        <DirectionIcon direction={signal.direction} />
        <Text variant="body" tone={headTone} style={[styles.flex, styles.title]}>
          {signal.title}
        </Text>
      </View>
      <Text variant="body" tone="secondary" style={styles.summary}>
        {signal.summary}
      </Text>
      {signal.contradictions.length > 0 && (
        <View style={styles.counter} accessible accessibilityLabel={`Counterpoint: ${signal.contradictions.join(". ")}`}>
          <CircleAlert size={22} strokeWidth={1.75} color={color.caution} />
          <View style={styles.flex}>
            <Text variant="body" tone="caution" style={styles.counterTitle}>
              Counterpoint
            </Text>
            {signal.contradictions.map((item) => (
              <Text key={item} variant="body" style={styles.summary}>
                {item}
              </Text>
            ))}
          </View>
        </View>
      )}
      <View style={[styles.inline, styles.cardFoot]}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${signal.evidence.length} readings, ${signal.confirmationCount} confirming. ${open ? "Hide" : "Show"} the readings`}
          style={styles.toggle}
        >
          {open ? <ChevronUp size={18} strokeWidth={1.5} color={color["text-secondary"]} /> : <ChevronDown size={18} strokeWidth={1.5} color={color["text-secondary"]} />}
          <Text variant="body-sm" tone="secondary">
            {signal.evidence.length} readings · {signal.confirmationCount} confirming
          </Text>
        </Pressable>
        <View style={styles.end}>
          <AskButton onPress={() => onAsk(signalPrompt(signal.symbol, signal.title))} />
        </View>
      </View>
      {open && (
        <View style={styles.evidence}>
          {signal.evidence.map((reading) => (
            <View key={`${reading.source}-${reading.label}`} style={styles.reading}>
              <View style={styles.flex}>
                <Text variant="body-sm" numberOfLines={2}>
                  {reading.label} · {reading.source}
                </Text>
                <Text variant="body-sm" tone="secondary">
                  Read {formatRelativeTime(reading.asOf, now)}
                </Text>
              </View>
              <Text variant="data">{reading.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ConsensusRow({ signal, logo, shareLabel, onAsk }: { signal: TrackerSignal; logo: string | null; shareLabel: string; onAsk: (prompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const long = signal.side === "LONG";
  const price = Number(signal.currentPxUsd);
  const entry = Number(signal.vwapEntryUsd);
  const fromEntry = Number.isFinite(price) && Number.isFinite(entry) && entry > 0 ? ((price - entry) / entry) * 100 * (long ? 1 : -1) : null;
  return (
    <View style={styles.consensus}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${signal.symbol}, ${long ? "long" : "short"}, ${signal.status}, ${shareLabel.toLowerCase()} ${signal.weightedScore}%`}
        style={styles.consensusHead}
      >
        <CoinMark symbol={signal.symbol} logo={logo} size={32} />
        <View style={styles.consensusAsset}>
          <Text variant="body" style={styles.symbolSmall} numberOfLines={1}>
            {signal.symbol}
          </Text>
          <View style={[styles.side, { backgroundColor: long ? color["positive-bg"] : color["negative-bg"] }]}>
            <Text variant="body-sm" tone={long ? "positive" : "negative"}>
              {long ? "Long" : "Short"}
            </Text>
          </View>
        </View>
        <Text variant="body-sm" tone="secondary" numberOfLines={2} style={styles.flex}>
          {signal.status}
        </Text>
        <Text variant="data" style={styles.share}>
          {signal.weightedScore}%
        </Text>
        <ChevronDown size={18} strokeWidth={1.5} color={color["text-secondary"]} style={open ? styles.flipped : undefined} />
      </Pressable>
      {open && (
        <View style={styles.consensusBody}>
          <View style={styles.figures}>
            <View style={styles.figure}>
              <Text variant="label" tone="muted">
                Mark
              </Text>
              <Text variant="data-sm">{Number.isFinite(price) ? formatPriceUsd(price) : "—"}</Text>
            </View>
            <View style={styles.figure}>
              <Text variant="label" tone="muted">
                Their avg. entry
              </Text>
              <Text variant="data-sm">{Number.isFinite(entry) ? formatPriceUsd(entry) : "—"}</Text>
            </View>
            <View style={styles.figure}>
              <Text variant="label" tone="muted">
                Since entry
              </Text>
              {fromEntry === null ? (
                <Text variant="data-sm" tone="muted">
                  —
                </Text>
              ) : (
                <Delta pct={fromEntry} />
              )}
            </View>
          </View>
          {signal.participants.slice(0, 5).map((participant) => (
            <View key={participant.wallet} style={styles.reading}>
              <Text variant="mono-addr" tone="secondary" numberOfLines={1} ellipsizeMode="middle" style={styles.flex}>
                {participant.wallet}
              </Text>
              <Text variant="label" tone="muted">
                {participant.performance.roiPct}% 30d · {formatCompactUsd(Number(participant.magnitudeUsd) || 0)}
              </Text>
            </View>
          ))}
          <AskButton
            label="Ask Elyra about this"
            onPress={() =>
              onAsk(`${signal.walletCount} top Hyperliquid wallets are ${long ? "long" : "short"} ${signal.symbol}. What is the case for and against following them?`)
            }
          />
        </View>
      )}
    </View>
  );
}

export function ElyraSignals({ active, onAsk }: { active: boolean; onAsk: (prompt: string) => void }) {
  const now = useMinute();
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);
  const watchlist = useWatchlist();
  const watched = useAssetsBySymbols(watchlist.symbols);

  /* The selected market first, then the watchlist; crypto only — the
     generator reads crypto venues and has nothing to say about a stock. */
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    if (selected?.assetType === "crypto") seen.add(selected.symbol.toUpperCase());
    for (const symbol of watchlist.symbols) {
      if (seen.size >= MAX_SYMBOLS) break;
      if (watched.bySymbol.get(symbol)?.assetType === "crypto") seen.add(symbol.toUpperCase());
    }
    return [...seen];
  }, [selected, watchlist.symbols, watched.bySymbol]);

  const market = useElyraSignals(symbols, active);
  const smart = useSmartMoney(active);
  const results = market.data?.results ?? [];
  const signals = results.flatMap((result) => result.signals);
  const quiet = results.filter((result) => result.signals.length === 0 && result.warnings.length === 0).map((result) => result.symbol);
  const unread = results.filter((result) => result.warnings.length > 0 && result.signals.length === 0).map((result) => result.symbol);
  const consensus = smart.state.signals.slice(0, CONSENSUS_SHOWN);
  const logoFor = useTickerLogos([...results.map((result) => result.symbol), ...consensus.map((signal) => signal.symbol)]);

  const [allConsensus, setAllConsensus] = useState(false);
  const hyperliquid = smart.state.origin === "hyperliquid";
  /* Defined only for Elyra's own read; the tracker's score keeps its own name. */
  const shareLabel = hyperliquid ? "Share of value" : "Tracker score";
  const shareHelp = hyperliquid
    ? "Of the money these wallets hold in this market, the share on this side. A ratio of position values, not a wallet count and not a confidence."
    : "The smart-money tracker's own score for this market.";
  const shownConsensus = allConsensus ? consensus : consensus.slice(0, CONSENSUS_PREVIEW);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            market.reload();
            smart.reload();
          }}
          tintColor={color.accent}
          colors={[color.accent]}
          progressBackgroundColor={color["surface-raised"]}
        />
      }
    >
      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.pageTitle}>
        Market signals
      </NativeText>
      {symbols.length === 0 ? (
        <Text variant="body" tone="secondary">
          Choose a crypto market, or add one to your watchlist, for Elyra to read.
        </Text>
      ) : market.loading ? (
        <View style={styles.list} accessibilityLabel="Loading signals">
          <Skeleton height={160} />
          <Skeleton height={64} />
        </View>
      ) : market.error !== null && market.data === null ? (
        <View style={styles.failed}>
          <Text variant="body" tone="secondary">
            Signals could not be read.
          </Text>
          <Text variant="body-sm" tone="secondary">
            {market.error}
          </Text>
          <Button label="Try again" size="sm" onPress={market.reload} />
        </View>
      ) : (
        <View style={styles.list}>
          {signals.map((signal) => (
            <SignalCard key={`${signal.symbol}-${signal.type}`} signal={signal} now={now} logo={logoFor(signal.symbol).logo} onAsk={onAsk} />
          ))}
          {/* Only symbols read cleanly with nothing past a threshold — never one that failed. */}
          {quiet.length > 0 && (
            <View style={styles.quiet}>
              <Info size={20} strokeWidth={1.5} color={color["text-secondary"]} />
              <Text variant="body" tone="secondary" style={[styles.flex, styles.summary]}>
                Nothing notable on {quiet.join(", ")} — no move, funding or venue gap past its threshold.
              </Text>
            </View>
          )}
          {unread.length > 0 && (
            <Text variant="body-sm" tone="caution">
              Not read: {unread.join(", ")}. A feed failed, so these are not called quiet.
            </Text>
          )}
        </View>
      )}

      <View style={styles.sectionHead}>
        <SerifHeading size={30}>Smart-money consensus</SerifHeading>
        {smart.state.origin !== null && (
          <Text variant="body" tone="secondary" style={styles.summary}>
            {hyperliquid ? "Elyra's read of top Hyperliquid wallets" : "From the smart-money tracker"}
          </Text>
        )}
      </View>
      {smart.state.loading ? (
        <Skeleton height={200} />
      ) : consensus.length > 0 ? (
        <>
          <View style={styles.panel}>
            <View style={styles.tableHead}>
              <Text variant="body-sm" tone="secondary" style={styles.headAsset}>
                Asset
              </Text>
              <Text variant="body-sm" tone="secondary" style={styles.flex}>
                Wallets
              </Text>
              <View style={styles.headShare}>
                <Text variant="body-sm" tone="secondary">
                  {shareLabel}
                </Text>
                <InfoTip label={`About ${shareLabel.toLowerCase()}`} text={shareHelp} />
              </View>
            </View>
            {shownConsensus.map((signal) => (
              <ConsensusRow key={signal.id} signal={signal} logo={logoFor(signal.symbol).logo} shareLabel={shareLabel} onAsk={onAsk} />
            ))}
          </View>
          {consensus.length > CONSENSUS_PREVIEW && (
            <Pressable
              onPress={() => setAllConsensus((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: allConsensus }}
              style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
            >
              <Text variant="body" style={[styles.flex, styles.viewAllText]}>
                {allConsensus ? "Show fewer" : `View all ${consensus.length} observations`}
              </Text>
              {allConsensus ? <ChevronUp size={22} strokeWidth={1.5} color={color["text-primary"]} /> : <ArrowRight size={22} strokeWidth={1.5} color={color["text-primary"]} />}
            </Pressable>
          )}
        </>
      ) : (
        <Text variant="body" tone="secondary">
          {smart.state.error ?? "No market where top wallets agree right now."}
        </Text>
      )}

      <Text variant="body-sm" tone="secondary" style={styles.summary}>
        Observations, not recommendations. Elyra never places orders.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 16 },
  list: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  end: { marginLeft: "auto" },
  pressed: { backgroundColor: color["surface-hover"] },
  pageTitle: { fontFamily: DISPLAY_SERIF, fontSize: 38, lineHeight: 46, color: color["text-primary"], letterSpacing: -0.4 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  card: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  symbol: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  strength: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  headline: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: fontFamily("sans", 600), fontSize: 22, lineHeight: 28 },
  summary: { fontSize: 15, lineHeight: 21 },
  counter: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: radius.panel, borderWidth: 1, borderColor: color.caution, backgroundColor: color["caution-bg"] },
  counterTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  cardFoot: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"], marginTop: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48 },
  flipped: { transform: [{ rotate: "180deg" }] },
  evidence: { gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  reading: { flexDirection: "row", alignItems: "center", gap: 12 },
  failed: { gap: 8, alignItems: "flex-start", padding: 16, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"] },
  quiet: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"] },
  sectionHead: { gap: 2, marginTop: 8 },
  panel: { borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"], overflow: "hidden" },
  tableHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 4, minHeight: 48 },
  headAsset: { width: 122 },
  headShare: { flexDirection: "row", alignItems: "center", gap: 2 },
  consensus: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  consensusHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, paddingLeft: 14, paddingRight: 12, paddingVertical: 8 },
  consensusAsset: { width: 80, gap: 4, alignItems: "flex-start" },
  symbolSmall: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 21 },
  side: { borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 1 },
  share: { fontSize: 16, lineHeight: 22, minWidth: 44, textAlign: "right" },
  consensusBody: { gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  figures: { flexDirection: "row", gap: 8, padding: 10, borderRadius: radius.control, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-raised"] },
  figure: { flex: 1, gap: 2 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 18, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-strong"] },
  viewAllText: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 22 },
});
