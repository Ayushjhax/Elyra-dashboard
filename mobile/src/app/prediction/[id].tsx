import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import { Bell, ExternalLink, Star } from "lucide-react-native";
import {
  isPredictionFailure,
  type BasketResponse,
  type BookResponse,
  type HistoryView,
  type LiveResponse,
  type PositionsView,
  type PredictionViewResponse,
  type SignalResponse,
} from "@/lib/prediction/api";
import { DetailScreen } from "~/components/portfolio/parts";
import { AlertSheet, type AlertSheetHandle } from "~/components/research/prediction/AlertSheet";
import { BasketPanel, BookPanel } from "~/components/research/prediction/Book";
import { ExecutionPanel, ExitPanel } from "~/components/research/prediction/Execution";
import { cents, closing, percent, points, probability, usdShort, PRICES_NOT_FORECASTS } from "~/components/research/prediction/format";
import { SignalPanel } from "~/components/research/prediction/SignalPanel";
import { AskButton, Card, Chips, Heading, Loading, Problem, Timestamp, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { usePredictionAccount, useWatchedMarkets, unwatch, watch } from "~/lib/stores/prediction";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One prediction market — the website's market details, order book and
   signal, the chat's /book and /basket, and the Mini App's market view.

   Outcomes are live: /markets/[id]/live is read every five seconds while
   this screen is on top and the app is in front, and not at all otherwise.
   Choosing an outcome points the history, order book, basket, execution
   estimate and exit liquidity at it.

   Everything is read-only and attributed: the data is Polymarket's, the
   analytics are Elyra's, and Elyra is not affiliated with Polymarket. A
   probability here is a price set by traders, and a signal is an
   observation about a book — neither is advice, and nothing here trades.
--------------------------------------------------------------------------- */

const LIVE_MS = 5_000;
const BOOK_MS = 15_000;
const INTERVALS = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "max", label: "All" },
] as const;
type Interval = (typeof INTERVALS)[number]["value"];

const PHASE: Record<string, string> = {
  live: "Live",
  snapshot: "Snapshot",
  stale: "Stale",
  reconnecting: "Reconnecting",
  connecting: "Connecting",
  disconnected: "Disconnected",
};

export default function PredictionMarketScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();
  const now = useMinute();
  const market = encodeURIComponent(id);
  const alerts = useRef<AlertSheetHandle>(null);

  const live = useResearch<LiveResponse>(focused ? `/api/prediction/markets/${market}/live` : null, { pollMs: LIVE_MS, timeoutMs: 30_000 });
  const data = live.data;
  const [chosen, setChosen] = useState<string | null>(null);
  const outcomes = data?.outcomes ?? [];
  const selectedIndex = Math.max(0, outcomes.findIndex((outcome) => outcome.tokenId === chosen));
  const selected = outcomes[selectedIndex] ?? null;
  const label = selected?.label ?? null;
  const outcomeQuery = label ? `?outcome=${encodeURIComponent(label)}` : "";

  const info = data?.market ?? null;
  const open = info !== null && !info.closed && info.status !== "resolved" && info.status !== "cancelled" && info.acceptingOrders !== false;
  const readBook = focused && open && selected !== null;

  const [interval, setWindow] = useState<Interval>("1d");
  const history = useResearch<PredictionViewResponse<HistoryView>>(
    focused && selected !== null && /^\d+$/.test(selected.tokenId) ? `/api/app/prediction?view=history&tokenId=${selected.tokenId}&interval=${interval}` : null,
    { timeoutMs: 30_000 },
  );
  const book = useResearch<BookResponse>(readBook ? `/api/prediction/markets/${market}/orderbook${outcomeQuery}` : null, { pollMs: BOOK_MS, timeoutMs: 30_000 });
  const basket = useResearch<BasketResponse>(readBook ? `/api/prediction/markets/${market}/basket${outcomeQuery}` : null, { timeoutMs: 30_000 });
  const signal = useResearch<SignalResponse>(readBook ? `/api/prediction/markets/${market}/signal?outcomeIndex=${selectedIndex}` : null, { timeoutMs: 120_000 });

  /* The shares you hold on this outcome, to prefill the exit — only when an account is linked. */
  const account = usePredictionAccount();
  const positions = useResearch<PredictionViewResponse<PositionsView>>(focused && account.data?.connected === true ? "/api/app/prediction?view=positions" : null, { timeoutMs: 45_000 });
  const held = (() => {
    const rows = positions.data?.data;
    if (rows === undefined || isPredictionFailure(rows) || !("positions" in rows)) return null;
    const match = rows.positions.find((row) => row.marketId === info?.id && row.outcome.toLowerCase() === (label ?? "").toLowerCase());
    return match?.shares ?? null;
  })();

  const watched = useWatchedMarkets();
  const isWatched = (watched.data ?? []).some((entry) => entry.marketId === (info?.id ?? id));
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const toggleWatch = async () => {
    setWatchBusy(true);
    const result = isWatched ? await unwatch(info?.id ?? id) : await watch(info?.id ?? id);
    setWatchError(result.ok ? null : result.error);
    setWatchBusy(false);
  };

  const h = history.data?.data;
  const historyView = h !== undefined && !isPredictionFailure(h) ? h : null;

  return (
    <DetailScreen title="Prediction market" onRefresh={live.reload} refreshing={live.refreshing}>
      {live.loading && <Loading>Reading the market…</Loading>}
      {live.error !== null && data === null && <Problem retry={live.reload}>{live.error}</Problem>}
      {data !== null && info !== null && (
        <View style={styles.page}>
          <View style={styles.head}>
            <Text variant="h1">{info.question}</Text>
            <Text variant="label" tone="secondary">
              {info.status ?? (info.closed ? "closed" : "open")} · {PHASE[data.phase] ?? data.phase} · {closing(info.endsAt, now, info.closed)}
            </Text>
            <Text variant="label" tone="muted">
              24h volume {usdShort(info.volume24hUsd)} · liquidity {usdShort(info.liquidityUsd)}
              {info.categories && info.categories.length > 0 ? ` · ${info.categories.slice(0, 3).join(", ")}` : ""}
            </Text>
          </View>

          <View style={shared.row}>
            <Button
              label={isWatched ? "Watching" : "Watch"}
              size="sm"
              loading={watchBusy}
              disabled={watchBusy || watched.data === null}
              icon={<Star size={14} strokeWidth={1.5} color={isWatched ? color.accent : color["text-primary"]} fill={isWatched ? color.accent : "none"} />}
              onPress={() => void toggleWatch()}
            />
            <Button label="Alert me" size="sm" icon={<Bell size={14} strokeWidth={1.5} color={color["text-primary"]} />} onPress={() => alerts.current?.open()} />
            {info.url ? (
              <Button
                label="Polymarket"
                size="sm"
                variant="ghost"
                accessibilityLabel="Open this market on Polymarket"
                icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
                onPress={() => openExternal(info.url as string)}
              />
            ) : null}
          </View>
          {watchError !== null && <Problem>{watchError}</Problem>}

          <Card>
            <Text variant="eyebrow" tone="muted">
              Outcomes · live
            </Text>
            {outcomes.map((outcome) => {
              const on = outcome.tokenId === (selected?.tokenId ?? null);
              return (
                <Pressable
                  key={outcome.tokenId}
                  onPress={() => setChosen(outcome.tokenId)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${outcome.label ?? "Outcome"}, ${probability(outcome.midpoint)}`}
                  style={[styles.outcome, on && styles.outcomeOn]}
                >
                  <View style={shared.flex}>
                    <Text variant="body-sm">{outcome.label ?? "Unlabelled outcome"}</Text>
                    <Text variant="label" tone="muted">
                      Bid {cents(outcome.bestBid)} · Ask {cents(outcome.bestAsk)} · {outcome.transport === "realtime" ? "live feed" : "snapshot"}
                    </Text>
                  </View>
                  <Text variant="data">{probability(outcome.midpoint)}</Text>
                </Pressable>
              );
            })}
            <Timestamp at={data.lastUpdateAt} label="Polymarket · updated" />
            {data.warnings.map((warning) => (
              <Text key={warning} variant="label" tone="caution">
                {warning}
              </Text>
            ))}
            <Text variant="label" tone="muted">
              {PRICES_NOT_FORECASTS}
            </Text>
          </Card>

          {selected !== null && (
            <Card>
              <View style={shared.row}>
                <Text variant="eyebrow" tone="muted" style={shared.flex}>
                  History · {label ?? "outcome"}
                </Text>
              </View>
              <Chips<Interval> label="History window" value={interval} onChange={setWindow} options={INTERVALS} />
              {history.loading && <Loading>Reading history…</Loading>}
              {history.error !== null && <Problem retry={history.reload}>{history.error}</Problem>}
              {h !== undefined && isPredictionFailure(h) && <Problem retry={history.reload}>{h.error}</Problem>}
              {historyView !== null &&
                (historyView.samples === undefined || historyView.samples === 0 ? (
                  <Text variant="body-sm" tone="secondary">
                    {historyView.note ?? "No history for this outcome."}
                  </Text>
                ) : (
                  <View style={styles.figures}>
                    <View style={styles.figure}>
                      <Text variant="label" tone="muted">
                        Change
                      </Text>
                      <Text variant="data" tone={(historyView.changePoints ?? 0) > 0 ? "positive" : (historyView.changePoints ?? 0) < 0 ? "negative" : "primary"}>
                        {points(historyView.changePoints)}
                      </Text>
                    </View>
                    <View style={styles.figure}>
                      <Text variant="label" tone="muted">
                        From → now
                      </Text>
                      <Text variant="data-sm">
                        {percent(historyView.openProbabilityPct)} → {percent(historyView.currentProbabilityPct)}
                      </Text>
                    </View>
                    <View style={styles.figure}>
                      <Text variant="label" tone="muted">
                        Range
                      </Text>
                      <Text variant="data-sm">
                        {percent(historyView.lowPct)}–{percent(historyView.highPct)}
                      </Text>
                    </View>
                  </View>
                ))}
            </Card>
          )}

          {!open ? (
            <Text variant="body-sm" tone="secondary">
              This market is not taking orders, so there is no live book, basket or signal to read.
            </Text>
          ) : (
            <>
              <Heading>Order book</Heading>
              {book.loading && <Loading>Reading the order book…</Loading>}
              {book.error !== null && book.data === null && <Problem retry={book.reload}>{book.error}</Problem>}
              {book.data !== null && <BookPanel outcome={book.data.outcome} bids={book.data.bids} asks={book.data.asks} analytics={book.data.analytics} transport={book.data.transport} />}

              <Heading>Fair value</Heading>
              {basket.loading && <Loading>Building the basket…</Loading>}
              {basket.error !== null && <Problem retry={basket.reload}>{basket.error}</Problem>}
              {basket.data !== null && <BasketPanel basket={basket.data.basket} />}

              <Heading note={<Button label="Read again" size="sm" variant="ghost" disabled={signal.loading || signal.refreshing} onPress={signal.reload} />}>Signal</Heading>
              {signal.loading && <Loading>Evaluating the strategies against the book…</Loading>}
              {signal.error !== null && signal.data === null && <Problem retry={signal.reload}>{signal.error}</Problem>}
              {signal.data !== null && <SignalPanel response={signal.data} question={info.question} />}

              <Heading>Size and exit</Heading>
              <ExecutionPanel marketId={info.id} outcome={label} active={readBook} />
              <ExitPanel marketId={info.id} outcome={label} held={held} active={readBook} />
            </>
          )}

          <AskButton label="Ask Elyra about this market" prompt={`Tell me about the prediction market "${info.question}": what it is pricing, how liquid it is, and what could move it before it resolves.`} />
          <Text variant="label" tone="muted">
            Market data from Polymarket; analytics by Elyra. Elyra is not affiliated with Polymarket, and nothing here is advice or places an order.
          </Text>
          <AlertSheet
            ref={alerts}
            marketId={info.id}
            question={info.question}
            outcomes={outcomes.map((outcome) => outcome.label).filter((value): value is string => value !== null)}
            current={selected?.midpoint ?? null}
          />
        </View>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  head: { gap: 4 },
  outcome: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.control, borderWidth: 1, borderColor: "transparent" },
  outcomeOn: { borderColor: color["accent-quiet"], backgroundColor: color["surface-raised"] },
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 12 },
  figure: { flexBasis: "30%", flexGrow: 1, gap: 2 },
});
