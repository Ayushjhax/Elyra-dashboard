import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell, CandlestickChart, LineChart, Maximize, Minimize, SlidersHorizontal, Star } from "lucide-react-native";
import { isPast } from "@/lib/alerts/rules";
import { formatCompactUsd, formatPrice, formatPriceUsd } from "@/lib/format";
import { INTERVALS } from "@/lib/market/chartWidget";
import { nearestLevels } from "@/lib/market/levels";
import { priceDecimals } from "@/lib/market/precision";
import type { PythAsset } from "@/lib/market/pyth/types";
import { AlertsSheet, type AlertsSheetHandle } from "~/components/market/AlertsSheet";
import { ChartView } from "~/components/market/ChartView";
import { DecisionBrief } from "~/components/market/DecisionBrief";
import { PriceFlash } from "~/components/market/PriceFlash";
import { Button, IconButton } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { Notice } from "~/components/wallet/parts";
import { useAlerts } from "~/lib/stores/alerts";
import { useAssets, useAssetsBySymbols, useLevels, usePrice } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useSecond } from "~/lib/useClock";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One market — the website's ChartPanel and the brief beside it, for a
   phone. The chart is the focus: on the first screen it fills everything
   between the controls above it and the bottom of the screen, measured from
   the real layout (the website's useFirstScreenFit), never estimated. The brief
   and the feed's provenance are a scroll below it.

   The price header (price and its tick flash, the 24h move, high, low and
   volume), the timeframe chips, the series style and the chart's settings,
   the prior-day pivots with their basis, the favourite star and the alerts
   are all here. Full screen turns the phone to landscape.
--------------------------------------------------------------------------- */

/** The chart never shrinks below this, however tall what is above it is. */
const CHART_MIN = 260;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data" maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    </View>
  );
}

function PivotRow({ symbol, price }: { symbol: string | null; price: number | null }) {
  const { data, loading } = useLevels(symbol);
  if (symbol === null) return null;
  if (loading) {
    return (
      <View style={styles.pivots}>
        <Skeleton width={220} height={12} />
      </View>
    );
  }
  if (!data?.levels) {
    return (
      <Text variant="label" tone="muted" style={styles.pivots}>
        Pivot levels unavailable{data?.error ? ` — ${data.error}` : ""}.
      </Text>
    );
  }
  const levels = data.levels;
  const near = price === null ? null : nearestLevels(levels, price);
  const entries: [string, number][] = [
    ["S2", levels.s2],
    ["S1", levels.s1],
    ["P", levels.pivot],
    ["R1", levels.r1],
    ["R2", levels.r2],
  ];
  return (
    <View style={styles.pivots}>
      <Text variant="label" tone="muted">
        Pivots · prior day · {data.source}, candle of {new Date(levels.basedOn).toISOString().slice(0, 10)} UTC
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pivotList}>
        {entries.map(([name, value]) => {
          const marked = near !== null && (near.above?.value === value || near.below?.value === value);
          return (
            /* Neutral: Sage and Clay mean a price moved, not that a level is above or below it. */
            <View key={name} style={styles.pivot}>
              <Text variant="label" tone="secondary">
                {name}
              </Text>
              <Text variant="data-sm" tone={marked ? "primary" : "muted"}>
                {formatPriceUsd(value)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The feed's source and freshness, ticking every second. */
function FeedLine({ row, status }: { row: ReturnType<typeof usePrice>["row"]; status: ReturnType<typeof usePrice>["status"] }) {
  const now = useSecond();
  const ageMs = row ? now - Date.parse(row.publishedAt) : null;
  const stale = status === "error" || (ageMs !== null && ageMs > 60_000);
  const seconds = ageMs === null ? 0 : Math.max(0, Math.round(ageMs / 1000));
  const age = seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : `${Math.round(seconds / 3600)}h ago`;
  const label = status === "loading" && !row ? "Connecting to Pyth" : status === "error" && !row ? "Pyth unavailable" : "Pyth";
  return (
    <View style={styles.feedLine}>
      <View style={[styles.dot, { backgroundColor: !row ? color["text-muted"] : stale ? color.negative : color.positive }]} />
      <Text variant="label" tone="muted" style={styles.flex}>
        {label}
        {row ? ` · ${stale ? "stale, " : ""}updated ${age}` : ""}
        {row ? ` · ±${formatPrice(row.confidence, priceDecimals(row.price))} confidence · ${row.publisherCount} publishers` : ""}
        {row?.marketSession && row.marketSession !== "regular" ? ` · ${row.marketSession} session` : ""}
      </Text>
    </View>
  );
}

export default function AssetScreen() {
  /* `alert` (and `target`) open the alert editor prefilled — the chat's
     "/alert SOL > 120" shortcut lands here. */
  const params = useLocalSearchParams<{ symbol: string; id?: string; alert?: string; target?: string }>();
  const symbolParam = (params.symbol ?? "").toUpperCase();
  const idParam = params.id !== undefined ? Number(params.id) : null;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  /* By feed id when the caller knew it (a search result, a watchlist row) —
     a ticker alone can name a token and a stock. */
  const byIds = useAssets(idParam === null ? [] : [idParam]);
  const bySymbols = useAssetsBySymbols(idParam === null ? [symbolParam] : []);
  const asset: PythAsset | undefined = idParam !== null ? byIds.byId.get(idParam) : bySymbols.bySymbol.get(symbolParam);
  const notFound = idParam === null && bySymbols.resolved.has(symbolParam) && asset === undefined;
  const symbol = asset?.symbol ?? symbolParam;

  const setSelectedAssetId = useAppStore((state) => state.setSelectedAssetId);
  useEffect(() => {
    if (asset) setSelectedAssetId(asset.id);
  }, [asset, setSelectedAssetId]);

  const interval = useAppStore((state) => state.interval);
  const setInterval = useAppStore((state) => state.setInterval);
  const chartStyle = useAppStore((state) => state.chartStyle);
  const setChartStyle = useAppStore((state) => state.setChartStyle);
  const indicators = useAppStore((state) => state.chartIndicators);
  const setIndicators = useAppStore((state) => state.setChartIndicators);
  const drawing = useAppStore((state) => state.chartDrawing);
  const setDrawing = useAppStore((state) => state.setChartDrawing);
  const favorite = useAppStore((state) => state.favorites.includes(symbol));
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);

  const { row, status, error, direction, seq } = usePrice(asset?.id ?? null);
  const crypto = asset?.assetType === "crypto";
  const levels = useLevels(crypto ? symbol : null).data?.levels ?? null;
  const alerts = useAlerts();
  const armed = alerts.alerts.filter((alert) => alert.symbol === symbol && alert.triggeredAt === null);
  const crossed = armed.some((alert) => isPast(alert, row?.price));

  const alertsSheet = useRef<AlertsSheetHandle>(null);
  const settings = useRef<BottomSheetHandle>(null);

  /* Once, when the market is known — and its price, when there is no level
     to prefill and the editor suggests one from it. */
  const prefilled = useRef(false);
  const wantsAlert = params.alert === "above" || params.alert === "below";
  const prefillTarget = params.target !== undefined && Number(params.target) > 0 ? params.target : null;
  useEffect(() => {
    if (!wantsAlert || prefilled.current || asset === undefined) return;
    if (prefillTarget === null && row === undefined) return;
    prefilled.current = true;
    alertsSheet.current?.open({ direction: params.alert as "above" | "below", target: prefillTarget });
  }, [asset, params.alert, prefillTarget, row, wantsAlert]);

  /* The measurement: the scroll view's own height, less what sits above the
     chart and the feed line under it. */
  const [viewport, setViewport] = useState(0);
  const [above, setAbove] = useState(0);
  const [below, setBelow] = useState(0);
  const chartHeight = viewport === 0 ? CHART_MIN : Math.max(CHART_MIN, Math.floor(viewport - above - below));

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    void ScreenOrientation.lockAsync(fullscreen ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, [fullscreen]);
  useEffect(
    () => () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    },
    [],
  );

  const stale = status === "error" && row !== undefined;
  const chartProps = {
    tvSymbol: asset?.tradingViewSymbol ?? null,
    symbol,
    interval,
    style: chartStyle,
    ema: indicators.ema,
    volume: indicators.volume,
    drawing,
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <IconButton accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <ArrowLeft size={20} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
        <CoinMark symbol={symbol} logo={asset?.logo ?? null} size={30} />
        <View style={styles.flex}>
          {asset ? (
            <Text variant="h2" numberOfLines={1} accessibilityRole="header">
              {asset.name}
            </Text>
          ) : (
            <Skeleton width={120} height={16} />
          )}
          <Text variant="label" tone="muted">
            {asset ? `${asset.symbol} / ${asset.quoteCurrency}` : symbol}
          </Text>
        </View>
        <IconButton
          accessibilityLabel={`Price alerts${armed.length > 0 ? `, ${armed.length} armed` : ""}`}
          onPress={() => alertsSheet.current?.open()}
        >
          <Bell size={19} strokeWidth={1.5} color={crossed ? color.caution : armed.length > 0 ? color["text-primary"] : color["text-secondary"]} />
          {armed.length > 0 && (
            <View style={styles.badge}>
              <Text variant="data-sm" tone="on-accent" allowFontScaling={false} style={styles.badgeText}>
                {armed.length}
              </Text>
            </View>
          )}
        </IconButton>
        <IconButton
          accessibilityLabel={favorite ? `Remove ${symbol} from favourites` : `Add ${symbol} to favourites`}
          onPress={() => toggleFavorite(symbol)}
        >
          <Star size={19} strokeWidth={1.5} color={favorite ? color.accent : color["text-muted"]} fill={favorite ? color.accent : "none"} />
        </IconButton>
      </View>

      {notFound ? (
        <View style={styles.missing}>
          <Text variant="body" tone="secondary">
            Pyth has no market called {symbolParam}.
          </Text>
          <Button label="Search markets" onPress={() => router.replace("/search")} />
        </View>
      ) : (
        <ScrollView
          onLayout={(event) => setViewport(event.nativeEvent.layout.height - insets.bottom)}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          <View onLayout={(event) => setAbove(event.nativeEvent.layout.height)}>
            {/* Price, its move, and the 24h window — wraps rather than shrinking type. */}
            <View style={styles.priceRow}>
              <View style={styles.priceBlock}>
                {row ? (
                  <PriceFlash seq={seq} direction={direction}>
                    <Text variant="price" tone={stale ? "secondary" : "primary"} accessibilityLiveRegion="polite">
                      {formatPriceUsd(row.price)}
                    </Text>
                  </PriceFlash>
                ) : status === "error" ? (
                  <Text variant="price" tone="muted">
                    —
                  </Text>
                ) : (
                  <Skeleton width={140} height={28} />
                )}
                <View style={styles.delta}>
                  <Delta pct={row?.change24hPct ?? null} reason="No 24h change for this market." />
                  <Text variant="label" tone="muted">
                    24h
                  </Text>
                </View>
              </View>
              <View style={styles.stats} accessibilityHint="Rolling 24 hours, from the exchange sources">
                <Stat label="High" value={row?.high24h ? formatPriceUsd(row.high24h) : "—"} />
                <Stat label="Low" value={row?.low24h ? formatPriceUsd(row.low24h) : "—"} />
                <Stat label="Volume" value={row?.volume24h ? formatCompactUsd(row.volume24h) : "—"} />
              </View>
            </View>

            {status === "error" && (
              <View style={styles.padded}>
                <Notice tone="negative">
                  {row ? `Showing the last price Pyth returned. ${error ?? ""}`.trim() : (error ?? "Pyth prices are unavailable.")}
                </Notice>
              </View>
            )}

            {/* Timeframes, series style, chart settings, full screen. */}
            <View style={styles.toolbar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {INTERVALS.map((value) => {
                  const active = value === interval;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setInterval(value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${value} interval`}
                      hitSlop={6}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text variant="data-sm" tone={active ? "on-accent" : "secondary"}>
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <IconButton
                accessibilityLabel={chartStyle === "candles" ? "Show as a line" : "Show as candles"}
                onPress={() => setChartStyle(chartStyle === "candles" ? "line" : "candles")}
              >
                {chartStyle === "candles" ? (
                  <LineChart size={18} strokeWidth={1.5} color={color["text-secondary"]} />
                ) : (
                  <CandlestickChart size={18} strokeWidth={1.5} color={color["text-secondary"]} />
                )}
              </IconButton>
              <IconButton accessibilityLabel="Chart settings" onPress={() => settings.current?.present()}>
                <SlidersHorizontal size={18} strokeWidth={1.5} color={color["text-secondary"]} />
              </IconButton>
              <IconButton accessibilityLabel="Full screen" onPress={() => setFullscreen(true)}>
                <Maximize size={18} strokeWidth={1.5} color={color["text-secondary"]} />
              </IconButton>
            </View>

            {indicators.levels !== false && <PivotRow symbol={crypto ? symbol : null} price={row?.price ?? null} />}
          </View>

          {asset ? (
            <ChartView {...chartProps} height={chartHeight} />
          ) : (
            <View style={[styles.chartLoading, { height: chartHeight }]}>
              <Skeleton width="100%" height={chartHeight - 32} rounded={radius.card} />
            </View>
          )}

          <View onLayout={(event) => setBelow(event.nativeEvent.layout.height)}>
            <FeedLine row={row} status={status} />
          </View>

          <View style={styles.padded}>
            <DecisionBrief symbol={symbol} row={row} levels={levels} />
          </View>
        </ScrollView>
      )}

      <AlertsSheet ref={alertsSheet} symbol={symbol} price={row?.price ?? null} />

      <BottomSheet ref={settings} title="Chart settings">
        <View style={styles.settings}>
          {(
            [
              ["ema", "Moving average (EMA 20)", "Exponential, on the price pane"],
              ["volume", "Volume", "Bars under the price"],
              ["levels", "Pivot levels", "Prior day's support and resistance, listed above the chart"],
            ] as const
          ).map(([key, label, hint]) => {
            const on = indicators[key] !== false;
            return (
              <Pressable
                key={key}
                onPress={() => setIndicators({ ...indicators, [key]: !on })}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                style={styles.setting}
              >
                <View style={styles.flex}>
                  <Text variant="body">{label}</Text>
                  <Text variant="label" tone="muted">
                    {hint}
                  </Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]} />
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setDrawing(!drawing)}
            accessibilityRole="switch"
            accessibilityState={{ checked: drawing }}
            style={styles.setting}
          >
            <View style={styles.flex}>
              <Text variant="body">Drawing tools</Text>
              <Text variant="label" tone="muted">
                TradingView&apos;s own; drawings last until the chart reloads.
              </Text>
            </View>
            <View style={[styles.check, drawing && styles.checkOn]} />
          </Pressable>
        </View>
      </BottomSheet>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} supportedOrientations={["landscape", "portrait"]}>
        <StatusBar hidden />
        <View style={styles.full}>
          {asset && <ChartView {...chartProps} height={window.height} guarded={false} />}
          <View style={[styles.exit, { top: 8 + insets.top }]}>
            <IconButton accessibilityLabel="Exit full screen" onPress={() => setFullscreen(false)}>
              <Minimize size={20} strokeWidth={1.5} color={color["text-primary"]} />
            </IconButton>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.accent,
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
  missing: { padding: 20, gap: 12 },
  content: { paddingBottom: 24 },
  priceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  priceBlock: { flexGrow: 1 },
  delta: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingLeft: 4 },
  stats: { flexDirection: "row", gap: 16 },
  stat: { alignItems: "flex-start" },
  padded: { paddingHorizontal: 16, paddingTop: 12 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingLeft: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color["border-subtle"],
  },
  chips: { gap: 4, paddingVertical: 6, paddingRight: 8 },
  chip: { minWidth: 40, height: 36, paddingHorizontal: 10, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: color.accent },
  pivots: { paddingHorizontal: 16, paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  pivotList: { gap: 16 },
  pivot: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  chartLoading: { padding: 16, backgroundColor: color["surface-panel"] },
  feedLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  settings: { padding: 16, gap: 4 },
  setting: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH_TARGET + 8, paddingVertical: 6 },
  check: { width: 22, height: 22, borderRadius: radius.chip, borderWidth: 1.5, borderColor: color["border-strong"] },
  checkOn: { backgroundColor: color.accent, borderColor: color.accent },
  full: { flex: 1, backgroundColor: color["surface-panel"] },
  exit: { position: "absolute", right: 8, borderRadius: radius.pill, backgroundColor: color["surface-raised"] },
});
