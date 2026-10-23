import { describe, expect, it } from "vitest";
import { chartWidgetConfig, isTradingViewUrl } from "@/lib/market/chartWidget";

const colors = { background: "#182117", grid: "#33402d", up: "#a3b18a", down: "#c97b63", axisText: "#c5c9b8", line: "#d2dc7a", ema: "#7f8a4e" };

describe("chartWidgetConfig", () => {
  it("maps the interval and style, and colours the candles from the passed palette", () => {
    const config = chartWidgetConfig({
      containerId: "tv",
      symbol: "BINANCE:SOLUSDT",
      interval: "4H",
      style: "line",
      ema: true,
      volume: false,
      drawing: false,
      colors,
    });
    expect(config.interval).toBe("240");
    expect(config.style).toBe("2");
    expect(config.hide_volume).toBe(true);
    expect(config.hide_side_toolbar).toBe(true);
    expect((config.overrides as Record<string, string>)["mainSeriesProperties.candleStyle.upColor"]).toBe(colors.up);
    expect((config.studies_overrides as Record<string, string>)["ema.ma.color"]).toBe(colors.ema);
    expect(config.studies).toEqual([{ id: "MAExp@tv-basicstudies", inputs: { length: 20 } }]);
  });
});

describe("isTradingViewUrl", () => {
  it("allows TradingView's widget origins and nothing else", () => {
    expect(isTradingViewUrl("https://s3.tradingview.com/tv.js")).toBe(true);
    expect(isTradingViewUrl("https://www.tradingview-widget.com/embed-widget/x")).toBe(true);
    expect(isTradingViewUrl("https://charting-library.tradingview.com/x")).toBe(true);
    expect(isTradingViewUrl("about:blank")).toBe(true);
    expect(isTradingViewUrl("https://tradingview.com.evil.example/")).toBe(false);
    expect(isTradingViewUrl("https://example.com/?u=https://s3.tradingview.com")).toBe(false);
    expect(isTradingViewUrl("http://s3.tradingview.com/tv.js")).toBe(false);
    expect(isTradingViewUrl("javascript:alert(1)")).toBe(false);
  });
});
