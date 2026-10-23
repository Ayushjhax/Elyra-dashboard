import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { CandlestickChart, Check, Pointer } from "lucide-react-native";
import { chartWidgetConfig, isTradingViewUrl, TRADINGVIEW_ORIGINS, TV_SCRIPT } from "@/lib/market/chartWidget";
import type { ChartStyle, Interval } from "@/lib/types";
import { Button } from "~/components/ui/controls";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { color, palette, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The chart — the website's TradingView widget (tv.js, the same symbol
   mapping, the same configuration from lib/market/chartWidget.ts, the same
   brand colours), in a WebView.

   The WebView is a boundary. It loads ONLY TradingView's widget origins:
   `originWhitelist` and `onShouldStartLoadWithRequest` both hold it to that
   list, and any other navigation — the TradingView logo, a link inside the
   widget — opens in the phone's browser instead. It cannot open windows,
   read files or mix in plain-http content.

   Like the website, the chart does not take the page's gestures until it is
   tapped: until then a swipe over it scrolls the screen, and after it the
   chart has pan, pinch and the crosshair, with a Release button to hand the
   screen back.

   Deviation, as on the website (README, deviation 2): the chart is
   TradingView's, embedded; its candles are recoloured to the brand's Sage
   and Clay through the widget's own overrides.
--------------------------------------------------------------------------- */

type Status = "loading" | "ready" | "error";

const WIDGET_COLORS = {
  background: color["surface-panel"],
  grid: color["border-subtle"],
  /* Candles are fills with no text on them: the raw palette, as on the website. */
  up: palette.sage,
  down: palette.clay,
  axisText: color["text-secondary"],
  line: color.accent,
  ema: color["accent-quiet"],
};

/** The page the WebView renders: the widget, and a message back when it has drawn or failed. */
function chartHtml(config: Record<string, unknown>): string {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body,#tv{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:${WIDGET_COLORS.background}}</style>
</head><body><div id="tv"></div>
<script>
  function send(message) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(message); }
  var timer = setTimeout(function () { send("error"); }, 10000);
  var observer = new MutationObserver(function () {
    if (document.querySelector("iframe")) { clearTimeout(timer); observer.disconnect(); send("ready"); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  function start() {
    try { new TradingView.widget(${json}); } catch (error) { clearTimeout(timer); send("error"); }
  }
</script>
<script src="${TV_SCRIPT}" onload="start()" onerror="clearTimeout(timer);send('error')"></script>
</body></html>`;
}

/** Whether the WebView may load this in place; anything else opens in the browser. */
function shouldLoad(request: ShouldStartLoadRequest): boolean {
  if (isTradingViewUrl(request.url)) return true;
  /* Only a top-level navigation is the person following a link; a frame the
     widget tries to load elsewhere is simply refused. */
  if (request.isTopFrame !== false && /^https?:\/\//i.test(request.url)) openExternal(request.url);
  return false;
}

export function ChartView({
  tvSymbol,
  symbol,
  interval,
  style,
  ema,
  volume,
  drawing,
  height,
  guarded = true,
}: {
  /** `asset.tradingViewSymbol`; null when Pyth prices it but TradingView has no chart. */
  tvSymbol: string | null;
  symbol: string;
  interval: Interval;
  style: ChartStyle;
  ema: boolean;
  volume: boolean;
  drawing: boolean;
  height: number;
  /** Hold the page's gestures until tapped. Off in full screen, where there is no page to scroll. */
  guarded?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [reloads, setReloads] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const html = useMemo(
    () =>
      tvSymbol === null
        ? null
        : chartHtml(
            chartWidgetConfig({ containerId: "tv", symbol: tvSymbol, interval, style, ema, volume, drawing, colors: WIDGET_COLORS }),
          ),
    [tvSymbol, interval, style, ema, volume, drawing],
  );
  const mount = `${html ?? ""}-${reloads}`;
  const [mountedFor, setMountedFor] = useState(mount);
  if (mountedFor !== mount) {
    setMountedFor(mount);
    setStatus("loading");
  }

  if (html === null) {
    return (
      <View style={[styles.plot, { height }]}>
        <EmptyState
          icon={<CandlestickChart size={22} strokeWidth={1.5} color={color["text-muted"]} />}
          title="No chart for this market"
          body={`Pyth prices ${symbol}, but TradingView has no matching market, so there is no chart to show. The live price above is unaffected.`}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${symbol} ${style === "line" ? "line" : "candlestick"} chart, ${interval}`}
      style={[styles.plot, { height }]}
    >
      <WebView
        key={mount}
        source={{ html, baseUrl: "https://s3.tradingview.com/" }}
        originWhitelist={[...TRADINGVIEW_ORIGINS, "about:blank", "about:srcdoc"]}
        onShouldStartLoadWithRequest={shouldLoad}
        onMessage={(event: WebViewMessageEvent): void => {
          const message: string = event.nativeEvent.data;
          if (message === "ready") setStatus("ready");
          else if (message === "error") setStatus("error");
        }}
        onError={() => setStatus("error")}
        onHttpError={(event) => {
          if (event.nativeEvent.url.startsWith(TV_SCRIPT)) setStatus("error");
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        overScrollMode="never"
        style={[styles.web, status !== "ready" && styles.hidden]}
        containerStyle={styles.web}
      />

      {status === "loading" && (
        <View style={styles.cover} accessibilityLabel="Loading the chart">
          <Skeleton width="100%" height={Math.max(height - 32, 40)} rounded={radius.card} />
        </View>
      )}

      {status === "error" && (
        <View style={styles.cover}>
          <EmptyState
            icon={<CandlestickChart size={22} strokeWidth={1.5} color={color["text-muted"]} />}
            title="Chart unavailable"
            body={`The ${symbol} chart did not load. Check the connection and reload, or switch interval to retry.`}
            action={<Button label="Reload the chart" size="sm" onPress={() => setReloads((value) => value + 1)} />}
          />
        </View>
      )}

      {/* The gesture guard: a swipe over the chart scrolls the screen until
          the chart is tapped. */}
      {status === "ready" && guarded && !engaged && (
        <Pressable
          onPress={() => setEngaged(true)}
          accessibilityRole="button"
          accessibilityLabel="Interact with the chart"
          style={styles.guard}
        >
          <View style={styles.pill}>
            <Pointer size={13} strokeWidth={1.5} color={color["text-secondary"]} />
            <Text variant="label" tone="secondary">
              Tap to zoom, pan and inspect
            </Text>
          </View>
        </Pressable>
      )}
      {status === "ready" && guarded && engaged && (
        <Pressable onPress={() => setEngaged(false)} accessibilityRole="button" style={[styles.pill, styles.release]}>
          <Check size={14} strokeWidth={1.5} color={color["text-primary"]} />
          <Text variant="label">Release chart</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { width: "100%", backgroundColor: color["surface-panel"], overflow: "hidden" },
  web: { flex: 1, backgroundColor: color["surface-panel"] },
  hidden: { opacity: 0 },
  cover: { ...StyleSheet.absoluteFill, padding: 16, justifyContent: "center" },
  guard: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "flex-end", paddingBottom: 40 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
  },
  release: { position: "absolute", bottom: 40, alignSelf: "center" },
});
