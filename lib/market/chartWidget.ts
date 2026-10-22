import type { ChartStyle, Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The TradingView widget's configuration — one definition for the website's
   ChartPanel and the Android app's chart, so both draw the same market, at
   the same interval, in the same colours.

   It is the `tv.js` widget, not `embed-widget-advanced-chart.js`: the newer
   embed silently drops `overrides`, which leaves the candles in
   TradingView's default teal and red — a contradiction of the brand's
   market semantics (README, deviation 2). `tv.js` honours them, so the chart
   is Sage up and Clay down like every other price in the product.

   Colours are passed in rather than read here: the website reads its CSS
   custom properties, the app reads lib/tokens.ts. Both are the same values.
--------------------------------------------------------------------------- */

export const TV_SCRIPT = "https://s3.tradingview.com/tv.js";

export const INTERVALS: readonly Interval[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

export const TV_INTERVAL: Record<Interval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "D",
  "1W": "W",
};

/** TradingView's series style ids: 1 is candles, 2 is a line. */
export const TV_STYLE: Record<ChartStyle, string> = { candles: "1", line: "2" };

export interface ChartColors {
  background: string;
  grid: string;
  /** Candles are fills with no text on them: the raw Sage and Clay. */
  up: string;
  down: string;
  axisText: string;
  /** The line series. */
  line: string;
  /** The EMA — muted, never Sage, which means "up". */
  ema: string;
}

export interface ChartWidgetInput {
  containerId: string;
  /** `asset.tradingViewSymbol`, derived server-side from the asset's class. */
  symbol: string;
  interval: Interval;
  style: ChartStyle;
  ema: boolean;
  volume: boolean;
  /** TradingView's own drawing tools. */
  drawing: boolean;
  colors: ChartColors;
}

/** The object handed to `new TradingView.widget(…)`. */
export function chartWidgetConfig(input: ChartWidgetInput): Record<string, unknown> {
  const { background, grid, up, down, axisText, line, ema } = input.colors;
  return {
    container_id: input.containerId,
    autosize: true,
    symbol: input.symbol,
    interval: TV_INTERVAL[input.interval],
    timezone: "Etc/UTC",
    theme: "dark",
    style: TV_STYLE[input.style],
    locale: "en",
    backgroundColor: background,
    gridColor: grid,
    toolbar_bg: background,
    hide_top_toolbar: true,
    /* Drawings live in the widget and last until the chart reloads; the free
       widget has no storage to keep them in. */
    hide_side_toolbar: !input.drawing,
    hide_volume: !input.volume,
    /* EMA 20, as an object so the period is ours rather than the widget's
       default of 9. */
    studies: input.ema ? [{ id: "MAExp@tv-basicstudies", inputs: { length: 20 } }] : [],
    allow_symbol_change: false,
    save_image: false,
    withdateranges: false,
    overrides: {
      "paneProperties.backgroundType": "solid",
      "paneProperties.background": background,
      "paneProperties.vertGridProperties.color": grid,
      "paneProperties.horzGridProperties.color": grid,
      "scalesProperties.backgroundColor": background,
      "scalesProperties.lineColor": grid,
      "scalesProperties.textColor": axisText,
      "mainSeriesProperties.candleStyle.upColor": up,
      "mainSeriesProperties.candleStyle.downColor": down,
      "mainSeriesProperties.candleStyle.borderUpColor": up,
      "mainSeriesProperties.candleStyle.borderDownColor": down,
      "mainSeriesProperties.candleStyle.wickUpColor": up,
      "mainSeriesProperties.candleStyle.wickDownColor": down,
      "mainSeriesProperties.lineStyle.color": line,
      "mainSeriesProperties.lineStyle.linewidth": 2,
    },
    /* The studies are a separate colour space from the series. The EMA's
       plot is named `ma`: "moving average exponential.plot.color", the
       documented spelling, is rejected by this widget ("no such study"). */
    studies_overrides: {
      "volume.volume.color.0": down,
      "volume.volume.color.1": up,
      "volume.volume.transparency": 62,
      "ema.ma.color": ema,
      "ema.ma.linewidth": 1,
    },
  };
}

/**
 * The origins the widget loads from. The app's WebView may load these and
 * nothing else; any other navigation opens in the phone's browser.
 */
export const TRADINGVIEW_ORIGINS: readonly string[] = [
  "https://s3.tradingview.com",
  "https://s.tradingview.com",
  "https://www.tradingview.com",
  "https://tradingview.com",
  "https://www.tradingview-widget.com",
  "https://s3-symbol-logo.tradingview.com",
];

/** Whether a URL is one the chart's WebView may load in place. */
export function isTradingViewUrl(url: string): boolean {
  if (url === "about:blank" || url === "about:srcdoc") return true;
  const match = /^(https:\/\/[^/?#]+)/i.exec(url);
  if (match === null) return false;
  const origin = match[1].toLowerCase();
  return TRADINGVIEW_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.tradingview(-widget)?\.com$/.test(origin);
}
