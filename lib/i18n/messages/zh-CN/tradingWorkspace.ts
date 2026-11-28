import type { Messages } from "../../translate";

/* Simplified Chinese — the trading workspace's chart legend, toolbar menus,
   decision brief and overview (components/panels/ChartPanel.tsx,
   components/agent/DecisionBrief.tsx, lib/market/chartBrief.ts,
   components/workspace/OverviewStrip.tsx). */

export const tradingWorkspace: Messages = {
  "{ema} above Pyth's 1h EMA":
    "高于 Pyth 1 小时 EMA {ema}",
  "{ema} below Pyth's 1h EMA":
    "低于 Pyth 1 小时 EMA {ema}",
  "{interval} candle close":
    "{interval} K 线收盘价",
  "{name} at {value}":
    "{name} 位于 {value}",
  "{pct}% above the live quote.":
    "高于实时报价 {pct}%。",
  "{pct}% below the live quote.":
    "低于实时报价 {pct}%。",
  "{source} {interval} candles":
    "{source} {interval} K 线",
  "{source} quote":
    "{source} 报价",
  "24h high at {value}":
    "24 小时最高价位于 {value}",
  "24h low at {value}":
    "24 小时最低价位于 {value}",
  "Above Pyth's 1h EMA by {distance}%":
    "高于 Pyth 1 小时 EMA {distance}%",
  "Below Pyth's 1h EMA by {distance}%":
    "低于 Pyth 1 小时 EMA {distance}%",
  "Chart type":
    "图表类型",
  "Drawing toolbar":
    "绘图工具栏",
  "Drawings stay on the chart until it reloads.":
    "绘图会保留在图表上，直到图表重新加载。",
  "EMA {period} · {interval}":
    "EMA {period} · {interval}",
  "Exposure":
    "敞口",
  "Fewer than {period} completed {interval} candles for {symbol}, so there is no EMA {period} yet.":
    "{symbol} 已完成的 {interval} K 线不足 {period} 根，因此暂无 EMA {period}。",
  "History unavailable":
    "历史暂不可用",
  "Last quote":
    "最近报价",
  "Last quote {price}":
    "最近报价 {price}",
  "Live price against Pyth's 1h EMA · refreshes every 5s · not financial advice.":
    "实时价格对比 Pyth 1 小时 EMA · 每 5 秒刷新 · 不构成投资建议。",
  "Live quote":
    "实时报价",
  "Live quote {price}":
    "实时报价 {price}",
  "Live quote is above the {interval} EMA {period} ({ema}) by {pct}% ({diff}).":
    "实时报价高于 {interval} EMA {period}（{ema}）{pct}%（{diff}）。",
  "Live quote is below the {interval} EMA {period} ({ema}) by {pct}% ({diff}).":
    "实时报价低于 {interval} EMA {period}（{ema}）{pct}%（{diff}）。",
  "Nearest level":
    "最近价位",
  "No {interval} candles for {symbol}, so there is no EMA {period} to compare the live quote with.":
    "{symbol} 没有 {interval} K 线，因此没有可与实时报价对比的 EMA {period}。",
  "No exchange candles for this market":
    "此市场没有交易所 K 线",
  "No pivots or 24h range for {symbol}, so there is no level to lead with.":
    "{symbol} 没有枢轴或 24 小时区间，因此没有可列出的价位。",
  "No portfolio history yet":
    "暂无投资组合历史",
  "Pivots":
    "枢轴",
  "Pointer only":
    "仅指针",
  "Price context":
    "价格背景",
  "Put in the composer: {prompt}":
    "填入输入框：{prompt}",
  "Set an alert on {symbol} at {title}":
    "为 {symbol} 设置提醒：{title}",
  "Suggested prompts":
    "推荐提问",
  "Your portfolio activity will appear here once you start trading.":
    "开始交易后，你的投资组合动态将显示在这里。",
};
