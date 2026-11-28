import type { Messages } from "../../translate";

/* Simplified Chinese — the strategy designer, library and AI lab (components/strategies, lib/strategies). */

export const strategies: Messages = {
  /* The page */
  "Strategies":
    "策略",
  "Design trading strategies from rules, start from Elyra's library or ask Elyra's AI, and backtest each on real market history.":
    "用规则设计交易策略，从 Elyra 的策略库开始，或让 Elyra 的 AI 提出想法，并用真实的历史行情回测每一个。",
  "Design, test and compare trading rules":
    "设计、测试和比较交易规则",
  "Design a strategy from rules, start from Elyra's library, or ask Elyra's AI for ideas — then test it on real market history. Nothing here trades.":
    "用规则设计策略，从 Elyra 的策略库开始，或让 Elyra 的 AI 提出想法——然后用真实的历史行情测试。这里不会下任何单。",
  "Strategy views":
    "策略视图",
  "Design":
    "设计",
  "Library":
    "策略库",
  "AI lab":
    "AI 实验室",
  "Saved ({count})":
    "已保存（{count}）",
  "My strategy":
    "我的策略",

  /* The designer */
  "The idea, in your words (optional)":
    "思路（用你自己的话，可选）",
  "Buy when":
    "买入条件",
  "Sell when":
    "卖出条件",
  "Exit conditions":
    "离场条件",
  "No exit conditions: the strategy leaves by its stop, target or time limit.":
    "没有离场条件：策略通过止损、止盈或持仓时限离场。",
  "Risk limits":
    "风险限制",
  "Time limit, bars":
    "持仓时限（K 线数）",
  "Leave a limit empty to go without it. Stops and targets are measured from the fill and checked inside every bar.":
    "留空即不设该限制。止损和止盈按成交价计算，并在每根 K 线内检查。",
  "The rules, in words":
    "规则说明",
  "Backtest":
    "回测",
  "Run backtest":
    "运行回测",
  "Testing on real history…":
    "正在用真实历史回测…",
  "Save changes":
    "保存修改",
  "Sign in to backtest and save strategies.":
    "登录后即可回测和保存策略。",
  "Saved to your strategies.":
    "已保存到你的策略。",
  "Changes saved.":
    "修改已保存。",
  "The backtest could not run.":
    "回测无法运行。",
  "Market (Binance spot)":
    "市场（Binance 现货）",
  "Test over":
    "回测区间",
  "Last 90 days":
    "最近 90 天",
  "Last 180 days":
    "最近 180 天",
  "Last year":
    "最近一年",
  "Last 2 years":
    "最近 2 年",
  "Last 4 years":
    "最近 4 年",

  /* Conditions */
  "Of the bar":
    "K 线的",
  "Period, bars":
    "周期（K 线数）",
  "Fast":
    "快线",
  "Slow":
    "慢线",
  "MACD line":
    "MACD 线",
  "Signal line":
    "信号线",
  "Histogram":
    "柱状图",
  "Deviations":
    "标准差倍数",
  "Band":
    "轨道",
  "Upper":
    "上轨",
  "Middle":
    "中轨",
  "Highest high":
    "最高价",
  "Lowest low":
    "最低价",
  "Condition {n}":
    "条件 {n}",
  "Remove condition {n}":
    "删除条件 {n}",
  "This":
    "这个",
  "Compared":
    "比较方式",
  "That":
    "那个",
  "How the conditions combine":
    "条件组合方式",
  "All must hold":
    "全部满足",
  "Any one is enough":
    "满足任一",
  "Add a condition":
    "添加条件",

  /* Operands and comparisons */
  "Simple moving average":
    "简单移动平均",
  "Exponential moving average":
    "指数移动平均",
  "RSI":
    "RSI",
  "MACD":
    "MACD",
  "Bollinger band":
    "布林带",
  "Donchian channel":
    "唐奇安通道",
  "ATR % of price":
    "ATR 占价格百分比",
  "% change":
    "涨跌幅 %",
  "Stochastic %K":
    "随机指标 %K",
  "Average volume":
    "平均成交量",
  "Number":
    "数值",
  "crosses above":
    "上穿",
  "crosses below":
    "下穿",
  "is above":
    "高于",
  "is below":
    "低于",
  "MACD line ({fast}, {slow}, {signal})":
    "MACD 线（{fast}, {slow}, {signal}）",
  "MACD signal ({fast}, {slow}, {signal})":
    "MACD 信号线（{fast}, {slow}, {signal}）",
  "MACD histogram ({fast}, {slow}, {signal})":
    "MACD 柱（{fast}, {slow}, {signal}）",
  "Upper Bollinger band ({period}, {deviations})":
    "布林带上轨（{period}, {deviations}）",
  "Lower Bollinger band ({period}, {deviations})":
    "布林带下轨（{period}, {deviations}）",
  "Middle Bollinger band ({period}, {deviations})":
    "布林带中轨（{period}, {deviations}）",
  "{period}-bar high":
    "{period} 根 K 线最高价",
  "{period}-bar low":
    "{period} 根 K 线最低价",
  "ATR({period}) % of price":
    "ATR({period}) 占价格百分比",
  "{period}-bar % change":
    "{period} 根 K 线涨跌幅 %",
  "Stochastic %K({period})":
    "随机指标 %K({period})",
  "{period}-bar average volume":
    "{period} 根 K 线平均成交量",
  "All of: {list}":
    "同时满足：{list}",
  "Any of: {list}":
    "满足任一：{list}",
  "a stop-loss {pct}% below the entry":
    "低于入场价 {pct}% 止损",
  "a take-profit {pct}% above the entry":
    "高于入场价 {pct}% 止盈",
  "after {bars} bars at most":
    "最多持有 {bars} 根 K 线",
  "Buy at the next bar's open when {rule}.":
    "当{rule}时，在下一根 K 线开盘买入。",
  "Sell at the first of: {list}.":
    "以下任一先发生即卖出：{list}。",

  /* Results */
  "Backtest result":
    "回测结果",
  "{symbol} · {timeframe} · last {days} days":
    "{symbol} · {timeframe} · 最近 {days} 天",
  "Equity, from {start}":
    "净值，起始 {start}",
  "Equity from {start} to {end}":
    "净值从 {start} 到 {end}",
  "Buy and hold":
    "买入持有",
  "Time in market":
    "持仓时间占比",
  "hold {pct}":
    "持有 {pct}",
  "max drawdown {pct}":
    "最大回撤 {pct}",
  "Too few trades to judge: treat this result as noise.":
    "交易次数太少，无法判断：请把这个结果视为噪声。",
  "Recent trades ({count})":
    "最近交易（{count}）",
  "Hypothetical: Binance spot history, long only, signals acted on at the next bar's open, 0.1% fees and 0.1% slippage each way, stops and targets inside the bar. Past results do not predict future ones.":
    "假设性结果：基于 Binance 现货历史，只做多，信号在下一根 K 线开盘执行，单边 0.1% 手续费和 0.1% 滑点，止损止盈在 K 线内判断。过去的结果不代表未来。",

  /* The library */
  "Elyra's library":
    "Elyra 策略库",
  "Well-known approaches, written out as rules, each with how it tends to fail. None comes with a promised return: open one, test it on your market, and change it.":
    "常见的交易方法，写成明确的规则，并注明各自容易失效的情形。没有任何一个承诺收益：打开它，在你的市场上测试，再修改。",
  "The rules":
    "规则",
  "Watch out: ":
    "注意：",
  "Open and backtest":
    "打开并回测",
  "Trend":
    "趋势",
  "Mean reversion in a trend":
    "趋势中的均值回归",
  "Breakout":
    "突破",
  "Momentum":
    "动量",
  "Mean reversion":
    "均值回归",
  "Golden cross trend":
    "金叉趋势",
  "Own the market only while its 50-day average is above its 200-day average: the slow, classic definition of an uptrend.":
    "只在 50 日均线高于 200 日均线时持有：经典而缓慢的上升趋势定义。",
  "Late in and late out. In a sideways market the averages cross back and forth and every crossing costs fees.":
    "入场晚，离场也晚。在横盘市场中均线反复交叉，每次交叉都要付手续费。",
  "RSI(2) pullback in an uptrend":
    "上升趋势中的 RSI(2) 回调",
  "Buy a sharp two-day pullback while the market is above its 200-day average, and sell on the first bounce above the 5-day average.":
    "在价格高于 200 日均线时买入为期两天的急跌回调，首次反弹站上 5 日均线时卖出。",
  "Many small wins and an occasional large loss when a pullback keeps falling — the stop and the 10-bar limit are what cap it.":
    "多数是小额盈利，偶尔在回调持续下跌时出现大额亏损——止损和 10 根 K 线的时限用来控制它。",
  "Donchian channel breakout":
    "唐奇安通道突破",
  "Buy when the close breaks the highest high of the last 20 bars; sell when it breaks the lowest low of the last 10.":
    "收盘价突破过去 20 根 K 线最高价时买入；跌破过去 10 根 K 线最低价时卖出。",
  "Most breakouts fail and are stopped out; the strategy lives on the few that become long trends.":
    "多数突破会失败并被止损；策略依靠少数演变成长期趋势的突破盈利。",
  "MACD momentum with a trend filter":
    "带趋势过滤的 MACD 动量",
  "Take MACD's bullish crossings only above the 200-bar EMA, so momentum is bought in the direction of the larger trend.":
    "只在价格高于 200 根 K 线 EMA 时采用 MACD 金叉，顺着更大的趋势买入动量。",
  "Crossings are frequent on 4-hour bars; in a choppy trend the fees add up.":
    "在 4 小时 K 线上交叉很频繁；趋势反复时手续费会累积。",
  "Bollinger reversion in a range":
    "区间内的布林带回归",
  "In a range, buy a close below the lower Bollinger band while RSI is weak, and sell back at the middle band.":
    "在区间行情中，收盘跌破布林带下轨且 RSI 偏弱时买入，回到中轨时卖出。",
  "Built for ranges. When a real downtrend starts, every lower band is broken again; the stop and time limit decide the damage.":
    "专为区间行情设计。真正的下跌趋势开始后，下轨会被一再跌破；损失大小取决于止损和时限。",
  "Time-series momentum":
    "时间序列动量",
  "Hold while the price is higher than 30 bars ago and above its 100-bar average; step aside when the 30-bar change turns negative.":
    "当价格高于 30 根 K 线前且高于 100 根 K 线均线时持有；30 根 K 线涨跌幅转负时离场。",
  "Slow to react at turning points, and whipsawed when the price hovers around where it was 30 bars ago.":
    "在拐点反应较慢，价格在 30 根 K 线前的水平附近徘徊时容易来回止损。",
  "Volume-confirmed breakout":
    "成交量确认的突破",
  "Buy a break of the 20-bar high only when volume is above its 20-bar average — a breakout with participation — and trail it with the 20-bar EMA.":
    "只在成交量高于 20 根 K 线均量时买入 20 根 K 线高点的突破——有参与度的突破——并用 20 根 K 线 EMA 跟踪离场。",
  "Volume is Binance's spot volume only; on a thin market, one large trade can fake it.":
    "成交量仅为 Binance 现货成交量；在流动性薄的市场上，一笔大单就能制造假信号。",
  "Calm-market trend entry":
    "平稳行情中的趋势入场",
  "Join a new uptrend — the 20-bar EMA crossing above the 50-bar — only while volatility is calm, with a fixed target and stop.":
    "只在波动平稳时加入新的上升趋势——20 根 K 线 EMA 上穿 50 根——并设固定的止盈和止损。",
  "Calm markets can stay calm and go nowhere; the target caps the big trends this would otherwise ride.":
    "平稳的市场可能一直平稳、毫无方向；止盈也会截断本可以吃到的大趋势。",
  "Deep dip buyer":
    "深度回调买入",
  "Buy only a deep, fast drop — 12% in 10 bars with RSI oversold — and sell the relief bounce or cut it quickly.":
    "只买入又深又快的下跌——10 根 K 线内下跌 12% 且 RSI 超卖——在反弹时卖出，或迅速止损。",
  "Catching a falling market: the rare crash that keeps going takes the full stop, so size it small.":
    "这是在接下跌的市场：少数持续下跌的暴跌会打满止损，所以仓位要小。",

  /* The AI lab */
  "Describe what you want — a market behaviour, a style, a risk you will accept — and Elyra's AI proposes three strategies. Elyra checks each against the rules and backtests it before you see it; the AI never sees or claims a result.":
    "描述你想要的——一种市场行为、一种风格、你能接受的风险——Elyra 的 AI 会提出三个策略。Elyra 会先按规则检查并回测每一个再展示给你；AI 看不到也不会声称任何结果。",
  "Your idea (optional)":
    "你的想法（可选）",
  "For example: buy strength after a quiet week, never hold more than five days, and keep losses small.":
    "例如：平静一周后买入走强的行情，持有不超过五天，亏损要小。",
  "Propose strategies":
    "提出策略",
  "Proposing, then backtesting each one…":
    "正在提出策略，并逐一回测…",
  "Sign in to use the AI lab. Each run counts as one question to Elyra.":
    "登录后即可使用 AI 实验室。每次运行计为向 Elyra 提问一次。",
  "Elyra's AI could not propose strategies just now.":
    "Elyra 的 AI 暂时无法提出策略。",
  "No proposal passed Elyra's checks this time. Try again, or put the idea differently.":
    "这次没有方案通过 Elyra 的检查。请再试一次，或换个说法描述想法。",
  "One proposal broke the rules and was dropped.":
    "有一个方案不符合规则，已被舍弃。",
  "{count} proposals broke the rules and were dropped.":
    "有 {count} 个方案不符合规则，已被舍弃。",
  "Elyra's AI: ":
    "Elyra 的 AI：",
  "It could not be backtested.":
    "无法回测。",
  "Open in the designer":
    "在设计器中打开",

  /* Saved */
  "Your strategies":
    "你的策略",
  "Sign in to keep the strategies you design.":
    "登录后即可保存你设计的策略。",
  "Nothing saved yet. Design one, or open one from the library or the AI lab, and save it.":
    "还没有保存的策略。自己设计一个，或从策略库、AI 实验室打开一个并保存。",
  "From Elyra's AI":
    "来自 Elyra 的 AI",
  "From the library":
    "来自策略库",
  "Your design":
    "你的设计",
  "Not backtested yet.":
    "尚未回测。",
  "Saved {when}":
    "保存于 {when}",

  /* The drawer's redesign: Design, Library, AI lab and Saved. */
  "Describe an idea. Elyra's AI proposes three strategies; Elyra checks their rules and backtests each one on historical data before you see it. The AI never sees or claims a result.":
    "描述一个想法。Elyra 的 AI 会提出三个策略；Elyra 会在你看到之前检查其规则，并用历史数据逐一回测。AI 从不查看也不声称任何结果。",
  "For example: buy strength after a quiet week, and hold for up to five days.":
    "例如：在平静的一周后买入走强的行情，最多持有五天。",
  "This takes up to a minute: three proposals, each checked and tested on real history.":
    "这最多需要一分钟：三个方案，每个都会经过检查并在真实历史数据上回测。",
  "Proposed strategies":
    "提出的策略",
  "Test period":
    "回测区间",
  "Strategy and rules":
    "策略与规则",
  "Strategy name":
    "策略名称",
  "Strategy idea (optional)":
    "策略想法（可选）",
  "Exit conditions are off and kept aside. The strategy leaves by its stop, target or time limit.":
    "离场条件已关闭并保留。策略将按止损、止盈或持仓时限离场。",
  "Time limit":
    "持仓时限",
  "bars":
    "根 K 线",
  "Leave a limit blank to skip it. Stops and targets are measured from the fill and checked within each bar.":
    "留空即不设该限制。止损和止盈以成交价计算，并在每根 K 线内检查。",
  "Rules in words":
    "规则说明",
  "A simulation on past prices, after fees. Nothing here places an order.":
    "基于历史价格的模拟，已计入手续费。这里不会下任何订单。",
  "View rules":
    "查看规则",
  "No saved strategies yet":
    "还没有保存的策略",
  "Save a strategy from Design, Library or AI lab to find it here.":
    "在设计、策略库或 AI 实验室中保存策略后，即可在这里找到。",
  "Design a strategy":
    "设计一个策略",
  "Browse library":
    "浏览策略库",
  "Research workspace · Historical backtests only.":
    "研究工作区 · 仅限历史回测。",
  "Strategy library":
    "策略库",
  "Strategies could not be read.":
    "无法读取策略。",
  "Period (bars)":
    "周期（K 线数）",
  "Fast (bars)":
    "快线（K 线数）",
  "Slow (bars)":
    "慢线（K 线数）",
  "Signal (bars)":
    "信号线（K 线数）",
  "Indicator":
    "指标",
  "Comparison":
    "比较方式",
  "Compare with":
    "比较对象",
  "{group}: how the conditions combine":
    "{group}：条件如何组合",
  "Add condition to {group}":
    "向{group}添加条件",
  "Add condition":
    "添加条件",
  "Up to {max} conditions in a group.":
    "每组最多 {max} 个条件。",
  "ATR %":
    "ATR %",
  "all of {list}":
    "以下全部满足：{list}",
  "any of {list}":
    "以下任一满足：{list}",
  "the next bar's open after {rule}":
    "{rule}之后的下一根 K 线开盘",
  "a stop {pct}% below the fill, inside the bar that reaches it":
    "低于成交价 {pct}% 的止损，在触及的那根 K 线内执行",
  "a target {pct}% above the fill, inside the bar that reaches it":
    "高于成交价 {pct}% 的止盈，在触及的那根 K 线内执行",
  "the open after {bars} bars held":
    "持有 {bars} 根 K 线后的开盘",
  "At {exit}.":
    "于{exit}。",
  "At the first of: {list}.":
    "以先到者为准：{list}。",
  "A bar that reaches both counts as the stop.":
    "若一根 K 线同时触及两者，按止损计。",
  "At the next bar's open when {rule}.":
    "当{rule}时，在下一根 K 线开盘。",
};
