import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Sparkles } from "lucide-react-native";
import { signalPrompt } from "@/lib/agent/suggestions";
import { formatCompactUsd, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import type { MarketSignal } from "@/lib/research/signalTypes";
import type { TrackerSignal } from "@/lib/tracker/types";
import { Button } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { useAppStore } from "~/lib/store";
import { useAssets, useAssetsBySymbols, useTickerLogos } from "~/lib/stores/market";
import { useElyraSignals, useSmartMoney } from "~/lib/stores/signals";
import { useWatchlist } from "~/lib/stores/watchlist";
import { useMinute } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Elyra's signals — the website's ElyraSignals, in the Elyra tab.

   MARKET SIGNALS are lib/research/signals.ts on the selected market and the
   watchlist: a move, a funding dislocation, a gap between venues, each with
   the readings behind it and anything pointing the other way. Strength is
   earned by corroboration, never asserted, and "nothing notable" is said
   plainly. SMART-MONEY CONSENSUS is where the most profitable Hyperliquid
   wallets agree. Each can be taken to the agent with "Ask Elyra".

   Observations from live data, not recommendations.
--------------------------------------------------------------------------- */

const MAX_SYMBOLS = 6;
const CONSENSUS_SHOWN = 12;

const STRENGTH: Record<MarketSignal["strength"], { label: string; border: string; tone: "primary" | "secondary" | "muted" }> = {
  high: { label: "High", border: color["accent-quiet"], tone: "primary" },
  medium: { label: "Medium", border: color["border-strong"], tone: "secondary" },
  low: { label: "Low", border: color["border-subtle"], tone: "muted" },
};

function DirectionIcon({ direction }: { direction: MarketSignal["direction"] }) {
  if (direction === "positive") return <ArrowUpRight size={14} strokeWidth={1.5} color={color.positive} accessibilityLabel="Up" />;
  if (direction === "negative") return <ArrowDownRight size={14} strokeWidth={1.5} color={color.negative} accessibilityLabel="Down" />;
  return <Minus size={14} strokeWidth={1.5} color={color["neutral-flat"]} accessibilityLabel="Flat" />;
}

function AskButton({ label = "Ask Elyra", onPress }: { label?: string; onPress: () => void }) {
  return <Button label={label} size="sm" variant="ghost" icon={<Sparkles size={12} strokeWidth={1.5} color={color["agent-accent"]} />} onPress={onPress} />;
}

function SignalCard({ signal, now, logo, onAsk }: { signal: MarketSignal; now: number; logo: string | null; onAsk: (prompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const strength = STRENGTH[signal.strength];
  return (
    <View style={styles.card}>
      <View style={styles.inline}>
        <CoinMark symbol={signal.symbol} logo={logo} size={24} />
        <Text variant="data">{signal.symbol}</Text>
        <DirectionIcon direction={signal.direction} />
        <View style={[styles.strength, { borderColor: strength.border }]}>
          <Text variant="label" tone={strength.tone}>
            {strength.label}
          </Text>
        </View>
        <Text variant="data-sm" tone="muted" numberOfLines={1} style={styles.end}>
          {formatRelativeTime(signal.generatedAt, now)}
        </Text>
      </View>
      <Text variant="body-sm" style={styles.title}>
        {signal.title}
      </Text>
      <Text variant="body-sm" tone="secondary">
        {signal.summary}
      </Text>
      {signal.contradictions.length > 0 && (
        <Text variant="label" tone="muted">
          Against: {signal.contradictions.join(" · ")}
        </Text>
      )}
      <View style={styles.inline}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.toggle}
        >
          <ChevronDown size={13} strokeWidth={1.5} color={color["text-secondary"]} style={open ? styles.flipped : undefined} />
          <Text variant="label" tone="secondary">
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
              <Text variant="label" tone="muted" numberOfLines={2} style={styles.flex}>
                {reading.label} · {reading.source}
              </Text>
              <Text variant="data-sm">{reading.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ConsensusRow({ signal, logo, onAsk }: { signal: TrackerSignal; logo: string | null; onAsk: (prompt: string) => void }) {
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
        accessibilityLabel={`${signal.symbol}, ${long ? "long" : "short"}, ${signal.weightedScore}% of value`}
        style={styles.consensusHead}
      >
        <CoinMark symbol={signal.symbol} logo={logo} size={22} />
        <Text variant="data" style={styles.symbol} numberOfLines={1}>
          {signal.symbol}
        </Text>
        <View style={[styles.side, { backgroundColor: long ? color["positive-bg"] : color["negative-bg"] }]}>
          <Text variant="label" tone={long ? "positive" : "negative"}>
            {long ? "Long" : "Short"}
          </Text>
        </View>
        <Text variant="label" tone="secondary" numberOfLines={1} style={styles.flex}>
          {signal.status}
        </Text>
        <Text variant="data-sm" tone="muted">
          {signal.weightedScore}%
        </Text>
        <ChevronDown size={13} strokeWidth={1.5} color={color["text-muted"]} style={open ? styles.flipped : undefined} />
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
      <Text variant="eyebrow" tone="muted">
        Market signals
      </Text>
      {symbols.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          Choose a crypto market, or add one to your watchlist, for Elyra to read.
        </Text>
      ) : market.loading ? (
        <View style={styles.list} accessibilityLabel="Loading signals">
          <Skeleton height={112} />
          <Skeleton height={112} />
        </View>
      ) : market.error !== null && market.data === null ? (
        <View style={styles.failed}>
          <Text variant="body-sm" tone="secondary">
            Signals could not be read.
          </Text>
          <Text variant="label" tone="muted">
            {market.error}
          </Text>
          <Button label="Try again" size="sm" onPress={market.reload} />
        </View>
      ) : (
        <View style={styles.list}>
          {signals.map((signal) => (
            <SignalCard key={`${signal.symbol}-${signal.type}`} signal={signal} now={now} logo={logoFor(signal.symbol).logo} onAsk={onAsk} />
          ))}
          {quiet.length > 0 && (
            <View style={styles.quiet}>
              <Text variant="body-sm" tone="secondary">
                Nothing notable on {quiet.join(", ")} right now
                <Text variant="body-sm" tone="muted">
                  {" "}
                  — no move, funding or venue gap past its threshold.
                </Text>
              </Text>
            </View>
          )}
          {unread.length > 0 && (
            <Text variant="label" tone="muted">
              Not read: {unread.join(", ")}
            </Text>
          )}
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text variant="eyebrow" tone="muted" style={styles.flex}>
          Smart-money consensus
        </Text>
        {smart.state.origin !== null && (
          <Text variant="label" tone="muted" numberOfLines={1}>
            {smart.state.origin === "hyperliquid" ? "Elyra's read of top Hyperliquid wallets" : "Smart-money tracker"}
          </Text>
        )}
      </View>
      {smart.state.loading ? (
        <Skeleton height={112} />
      ) : consensus.length > 0 ? (
        <View style={styles.panel}>
          {consensus.map((signal) => (
            <ConsensusRow key={signal.id} signal={signal} logo={logoFor(signal.symbol).logo} onAsk={onAsk} />
          ))}
        </View>
      ) : (
        <Text variant="body-sm" tone="secondary">
          {smart.state.error ?? "No market where top wallets agree right now."}
        </Text>
      )}

      <Text variant="label" tone="muted">
        Observations from live data, not recommendations. Elyra never places orders.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  list: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  end: { marginLeft: "auto" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  card: {
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: color["agent-rail"],
    borderTopRightRadius: radius.card,
    borderBottomRightRadius: radius.card,
    backgroundColor: color["surface-raised"],
  },
  strength: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6 },
  title: { marginTop: 4, fontFamily: fontFamily("sans", 500) },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 48 },
  flipped: { transform: [{ rotate: "180deg" }] },
  evidence: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: color["border-subtle"] },
  reading: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  failed: { gap: 6, alignItems: "flex-start", padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"] },
  quiet: { padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"] },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  panel: { borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"], overflow: "hidden" },
  consensus: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  consensusHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingHorizontal: 10 },
  symbol: { width: 56 },
  side: { borderRadius: radius.chip, paddingHorizontal: 6 },
  consensusBody: { gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  figures: { flexDirection: "row", gap: 8, padding: 8, borderRadius: radius.control, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-raised"] },
  figure: { flex: 1, gap: 2 },
});
