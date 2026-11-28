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

  /* The order ticket: entering an order, an order waiting for its fill, a position just opened. */
  "{quantity} {coin}":
    "{quantity} {coin}",
  "Best ask":
    "最优卖价",
  "Best bid":
    "最优买价",
  "Book unavailable":
    "订单簿暂不可用",
  "Cancelling…":
    "正在撤单…",
  "Close position":
    "平仓",
  "Closed at {price}, {pnl} after fees.":
    "已按 {price} 平仓，扣除手续费后盈亏 {pnl}。",
  "Est. stop-loss":
    "预计止损价",
  "Est. take-profit":
    "预计止盈价",
  "Estimated fill":
    "预计成交价",
  "Filled at {price} vs. estimated {estimate}":
    "成交价 {price}，预计 {estimate}",
  "Filled. Reading the position…":
    "已成交，正在读取持仓…",
  "From the chart's quote until Hyperliquid's book is read.":
    "在读取到 Hyperliquid 订单簿之前，按图表报价估算。",
  "Limit order cancelled":
    "限价单已撤销",
  "Limit order failed":
    "限价单失败",
  "Limit price":
    "限价",
  "Limit price ($)":
    "限价（美元）",
  "Live limit long placed":
    "实盘限价做多单已挂出",
  "Live limit short placed":
    "实盘限价做空单已挂出",
  "Live long opened":
    "实盘做多已开仓",
  "Live short opened":
    "实盘做空已开仓",
  "Margin at {leverage}×":
    "{leverage}× 保证金",
  "New order":
    "新订单",
  "Nothing was opened.":
    "没有开立任何持仓。",
  "Open live long":
    "实盘开多",
  "Open live short":
    "实盘开空",
  "Open paper long":
    "模拟开多",
  "Open paper short":
    "模拟开空",
  "Order preview":
    "订单预览",
  "Order size":
    "订单规模",
  "Order size ($)":
    "订单规模（美元）",
  "Order size is the position's full value; the margin is what it holds from your account.":
    "订单规模是持仓的全部名义价值；保证金是从你的账户中占用的部分。",
  "Paper fills at Hyperliquid's mid, moved {bps} bps against you.":
    "模拟成交价为 Hyperliquid 的中间价，并向不利方向偏移 {bps} 个基点。",
  "Paper limit long placed":
    "模拟限价做多单已挂出",
  "Paper limit short placed":
    "模拟限价做空单已挂出",
  "Paper long opened":
    "模拟做多已开仓",
  "Paper short opened":
    "模拟做空已开仓",
  "Place live limit long":
    "挂实盘限价做多单",
  "Place live limit short":
    "挂实盘限价做空单",
  "Place paper limit long":
    "挂模拟限价做多单",
  "Place paper limit short":
    "挂模拟限价做空单",
  "Quantity":
    "数量",
  "Resting on Hyperliquid's book at {price}; nothing opens until it fills.":
    "正以 {price} 挂在 Hyperliquid 订单簿上；成交前不会开仓。",
  "Sent to Hyperliquid. Waiting for the fill to be confirmed.":
    "已发送至 Hyperliquid，正在等待成交确认。",
  "Stop-loss (SL)":
    "止损（SL）",
  "Take-profit (TP)":
    "止盈（TP）",
  "Taker fee ({pct}%)":
    "吃单手续费（{pct}%）",
  "Waiting for {coin} to trade at {price}. Paper limit orders are checked every five minutes; nothing opens until one fills.":
    "等待 {coin} 成交于 {price}。模拟限价单每五分钟检查一次；成交前不会开仓。",
};
