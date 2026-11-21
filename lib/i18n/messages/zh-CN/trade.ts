import type { Messages } from "../../translate";

/* Simplified Chinese — components/trade. */

export const trade: Messages = {
  "{bps} bps better":
    "好 {bps} 个基点",
  "{bps} bps worse":
    "差 {bps} 个基点",
  "{closed} of {original} closed so far, {pnl} after fees":
    "已平仓 {closed}（共 {original}），扣除手续费后 {pnl}",
  "{side} {coin} opened ({mode}).":
    "已开仓：{side} {coin}（{mode}）。",
  "{symbol} is not one of Elyra's Hyperliquid perp markets, so it cannot be traded from the chart.":
    "{symbol} 不在 Elyra 的 Hyperliquid 永续市场之列，因此无法从图表交易。",
  "24h high":
    "24 小时最高",
  "24h low":
    "24 小时最低",
  "About {price} on average, {bps} bps from the mid, across {levels} book levels.":
    "平均约 {price}，距中间价 {bps} 个基点，吃掉 {levels} 档订单簿。",
  "Ask":
    "卖价",
  "At this price the order crosses the book and fills at once, like a market order.":
    "以这个价格，订单会穿过订单簿立即成交，如同市价单。",
  "Bid":
    "买价",
  "Bids / asks on Hyperliquid's book, read every 3 seconds.":
    "Hyperliquid 订单簿上的买单 / 卖单，每 3 秒读取一次。",
  "Close {pct}% of the position":
    "平掉 {pct}% 的头寸",
  "Close all of the position":
    "平掉全部头寸",
  "Edit TP/SL":
    "修改止盈/止损",
  "Enter the price to open at.":
    "请输入开仓价格。",
  "Filled at {price}":
    "成交价 {price}",
  "Filled at {price} against {expected} expected":
    "成交价 {price}，预期 {expected}",
  "How it would fill":
    "预计如何成交",
  "Hyperliquid's order book could not be read just now.":
    "暂时无法读取 Hyperliquid 的订单簿。",
  "Isolated margin, held to Elyra's limits and your account's. Leverage magnifies losses; a stop can fill past its price in a fast market.":
    "逐仓保证金，受 Elyra 的限额和你账户的限额约束。杠杆会放大亏损；行情剧烈时，止损可能以差于设定的价格成交。",
  "Limit":
    "限价",
  "Limit {side} at {price}":
    "限价{side} {price}",
  "Limit order placed at {price}. It is listed below until it fills or you cancel it.":
    "限价单已挂在 {price}。成交或你撤单之前，它会列在下方。",
  "Long {coin} now":
    "立即做多 {coin}",
  "no slippage":
    "无滑点",
  "Open a long or a short on Hyperliquid from the chart, with its take-profit and stop-loss, and manage what is open.":
    "从图表在 Hyperliquid 开多或开空，附带止盈和止损，并管理已有持仓。",
  "Open on {coin}":
    "{coin} 的持仓",
  "Order type":
    "订单类型",
  "paper fills pay the estimated taker fee and slippage":
    "模拟成交计入估算的吃单手续费和滑点",
  "Prices from the chart":
    "图表上的价格",
  "Reading the order book…":
    "正在读取订单簿…",
  "Rests {pct}% from the mid until the price trades there.":
    "挂在距中间价 {pct}% 处，直到价格到达那里。",
  "Save exits":
    "保存止盈止损",
  "Sending…":
    "正在发送…",
  "Short {coin} now":
    "立即做空 {coin}",
  "Sign in to trade {symbol} from the chart. New trades start on paper.":
    "登录后即可从图表交易 {symbol}。新交易从模拟开始。",
  "Spread {bps} bps":
    "价差 {bps} 个基点",
  "Swap {symbol} in your wallet":
    "在你的钱包中兑换 {symbol}",
  "Take-profit at {tp} · stop-loss at {sl}, placed on Hyperliquid with the entry.":
    "止盈 {tp} · 止损 {sl}，与入场单一起提交到 Hyperliquid。",
  "Taker fee about {fee}.":
    "吃单手续费约 {fee}。",
  "The visible book cannot fill this within the {cap}% cap; part of it may not fill.":
    "可见订单簿无法在 {cap}% 的上限内成交这笔订单；其中一部分可能不会成交。",
  "TP {tp} · SL {sl}":
    "止盈 {tp} · 止损 {sl}",
  "Within {pct}%":
    "{pct}% 以内",
  "Within the {cap}% slippage cap.":
    "在 {cap}% 的滑点上限之内。",
};
