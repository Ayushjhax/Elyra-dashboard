import type { Messages } from "../../translate";

/* Simplified Chinese — Labels defined in lib/ — statuses, ledger empty states, linked-account names. */

export const common: Messages = {
  " — Telegram is told on the next check":
    "——下一次检查时会通知 Telegram",
  " — the app is told on the next check":
    "——下一次检查时会通知应用",
  " — the Elyra app is told on the next check":
    "——下一次检查时会通知 Elyra 应用",
  " · exchange 24h range":
    " · 交易所 24 小时区间",
  " · last known":
    " · 上次已知",
  " · prior-day pivots":
    " · 前一日枢轴",
  " {count} more armed.":
    "另有 {count} 条生效中。",
  " Some sources failed, so this may be incomplete.":
    "部分数据源读取失败，结果可能不完整。",
  ", {pct}% away":
    "，距离 {pct}%",
  ", {pnl} PnL":
    "，盈亏 {pnl}",
  ", and it is not being sent anywhere":
    "，但不会发送到任何地方",
  ", and it is not reaching this phone yet":
    "，但尚未推送到这部手机",
  "{count} open":
    "{count} 个持仓",
  "{count} open · partly unread":
    "{count} 个持仓 · 部分未读取",
  "{name} at {value} is {pct}% above. Set an alert on it from the chart.":
    "{name} 位于 {value}，比现价高 {pct}%。可在图表上为它设置提醒。",
  "{name} at {value} is {pct}% below. Set an alert on it from the chart.":
    "{name} 位于 {value}，比现价低 {pct}%。可在图表上为它设置提醒。",
  "{name} is reading {activity}…":
    "{name}正在读取{activity}…",
  "{name} is working…":
    "{name}正在处理…",
  "{pct}% above its EMA":
    "高于 EMA {pct}%",
  "{pct}% below its EMA":
    "低于 EMA {pct}%",
  "{quantity} {symbol} spot":
    "{quantity} {symbol} 现货",
  "{side} {size} {symbol} perp on {venue} ({notional}{pnl})":
    "{venue} 上{side} {size} {symbol} 永续（{notional}{pnl}）",
  "{symbol} at {price}":
    "{symbol} 报 {price}",
  "{symbol} at {price} sits inside today's {low}–{high} range ({pct}% up it)":
    "{symbol} 报 {price}，位于今日 {low}–{high} 区间内（位于 {pct}%）",
  "{symbol} at {price} sits near the bottom of today's {low}–{high} range ({pct}% up it)":
    "{symbol} 报 {price}，接近今日 {low}–{high} 区间的底部（位于 {pct}%）",
  "{symbol} at {price} sits near the top of today's {low}–{high} range ({pct}% up it)":
    "{symbol} 报 {price}，接近今日 {low}–{high} 区间的顶部（位于 {pct}%）",
  "above every pivot level, {name} {value} the nearest":
    "高于所有枢轴价位，最近的是 {name} {value}",
  "Action awaiting your review":
    "有操作等待你审核",
  "All upstreams responding":
    "所有上游服务均正常响应",
  "Apple":
    "Apple",
  "Awaiting action":
    "等待操作",
  "Balances are not configured on the server.":
    "服务器未配置余额读取。",
  "below every pivot level, {name} {value} the nearest":
    "低于所有枢轴价位，最近的是 {name} {value}",
  "between {below} {belowValue} and {above} {aboveValue}":
    "介于 {below} {belowValue} 和 {above} {aboveValue} 之间",
  "Chart and orders":
    "图表与订单",
  "Checking upstreams":
    "正在检查上游服务",
  "Checks a move":
    "检查操作",
  "Checks a prepared move before you review and sign it.":
    "在你审核并签名之前检查已准备的操作。",
  "Completed buys and sells are recorded here with the fee paid and the transaction that carried them.":
    "已完成的买入和卖出会连同支付的手续费和对应交易记录在这里。",
  "Connect a wallet to see your {symbol} exposure.":
    "连接钱包即可查看你的 {symbol} 敞口。",
  "Couldn't read":
    "无法读取",
  "Default":
    "默认",
  "DeFi has no order book":
    "DeFi 没有订单簿",
  "Discord":
    "Discord",
  "Elyra completed an action":
    "Elyra 完成了一项操作",
  "Elyra is allocating the question…":
    "Elyra 正在分配问题…",
  "Email":
    "邮箱",
  "Entries and exits are recorded at the price you paid, in cents on the dollar of the final settlement.":
    "入场和出场按你支付的价格记录，以最终结算每美元的美分表示。",
  "Entries waiting on a price sit here, and so do the stops and take-profits attached to an open position.":
    "等待某个价格的入场单会显示在这里，附在未平仓头寸上的止损和止盈也一样。",
  "Every open, add and close is written to this list with its price, fee and transaction.":
    "每次开仓、加仓和平仓都会连同价格、手续费和交易记录在这个列表中。",
  "Exchange 24h range":
    "交易所 24 小时区间",
  "Explain how Solana staking works":
    "解释一下 Solana 质押是如何运作的",
  "Farcaster":
    "Farcaster",
  "Gathers the live figures with Elyra's tools.":
    "使用 Elyra 的工具收集实时数据。",
  "GitHub":
    "GitHub",
  "Google":
    "Google",
  "Last 30 days":
    "最近 30 天",
  "Last 7 days":
    "最近 7 天",
  "Limit orders wait here until they fill or you cancel them. Market orders skip this list entirely.":
    "限价单在这里等待，直到成交或被你撤销。市价单完全不会出现在此列表中。",
  "Limit, stop and trigger orders on every venue wait here until they fill or you cancel them.":
    "各平台的限价单、止损单和触发单会在这里等待，直到成交或被你撤销。",
  "Live figures":
    "实时数据",
  "Name the layout.":
    "请为布局命名。",
  "No {symbol} exposure across your connected accounts.":
    "你已连接的账户中没有 {symbol} 敞口。",
  "No DeFi settlements yet":
    "还没有 DeFi 结算",
  "No open orders on prediction markets":
    "预测市场没有未成交订单",
  "No perp fills yet":
    "还没有永续合约成交",
  "No perp positions open":
    "没有未平仓的永续合约",
  "No prediction fills yet":
    "还没有预测市场成交",
  "No prediction positions":
    "没有预测市场头寸",
  "No resting orders":
    "没有挂单",
  "No resting perp orders":
    "没有永续合约挂单",
  "No resting spot orders":
    "没有现货挂单",
  "No spot fills yet":
    "还没有现货成交",
  "No spot positions":
    "没有现货头寸",
  "No wallet":
    "无钱包",
  "None yet":
    "暂无",
  "Not set":
    "未设置",
  "Nothing armed on {symbol}. Set a price alert from the chart to be told when it moves.":
    "{symbol} 没有生效中的提醒。在图表上设置价格提醒，价格变动时即可收到通知。",
  "Nothing deployed on-chain":
    "链上没有已部署的资产",
  "Partly unread":
    "部分未读取",
  "Passkey":
    "通行密钥",
  "Perps on a connected venue appear here with their size, entry, liquidation price and PnL. Connect a venue from Agent.":
    "已连接平台上的永续合约会连同规模、入场价、强平价和盈亏显示在这里。请在“代理”中连接交易平台。",
  "Phone":
    "手机号",
  "Price alert triggered":
    "价格提醒已触发",
  "Prior-day pivots":
    "前一日枢轴",
  "Pyth price feed is not configured":
    "未配置 Pyth 价格源",
  "Pyth price feed is not responding":
    "Pyth 价格源没有响应",
  "Pyth price feed is returning errors":
    "Pyth 价格源返回错误",
  "Research with Elyra":
    "与 Elyra 一起研究",
  "Reviews and weighs":
    "审阅与权衡",
  "Reviews the figures and weighs them against your saved rules.":
    "审阅数据，并对照你保存的规则进行权衡。",
  "Sign-in is not configured, so no account can be read.":
    "未配置登录，因此无法读取任何账户。",
  "Six layouts are saved, the most there can be. Delete one first.":
    "已保存六个布局，已达上限。请先删除一个。",
  "Solana RPC is not configured":
    "未配置 Solana RPC",
  "Solana RPC is not responding":
    "Solana RPC 没有响应",
  "Solana RPC is returning errors":
    "Solana RPC 返回错误",
  "Supplied balances, staked tokens and LP ranges are listed here once you deploy them.":
    "部署后，存入余额、质押代币和 LP 区间会列在这里。",
  "Supply, withdraw and LP rebalance transactions land here once they confirm on-chain.":
    "存入、提取和 LP 再平衡交易在链上确认后会显示在这里。",
  "Supplying, withdrawing and rebalancing settle straight to the chain. Look under History for what has already gone through.":
    "存入、提取和再平衡都直接在链上结算。已完成的操作请在“历史”中查看。",
  "Telegram":
    "Telegram",
  "The 24h high at {value} is {pct}% away. Set an alert on it from the chart.":
    "24 小时最高价 {value}，距离 {pct}%。可在图表上为它设置提醒。",
  "The 24h low at {value} is {pct}% away. Set an alert on it from the chart.":
    "24 小时最低价 {value}，距离 {pct}%。可在图表上为它设置提醒。",
  "These fill at market against the book, so they rarely rest. Anything that does wait shows up here.":
    "这些订单按市价与订单簿撮合成交，很少挂单。任何在等待的订单都会显示在这里。",
  "These markets settle to $0 or $1 at resolution. Take a side and the position tracks its mark until then.":
    "这些市场在结算时价值为 $0 或 $1。选择一方后，头寸会跟踪其标记价格直到结算。",
  "Tokens you hold in your wallet or on a connected venue appear here at the live price. A wallet holding can be sold from its row.":
    "你在钱包或已连接平台上持有的代币会按实时价格显示在这里。钱包持仓可以在其所在行直接卖出。",
  "Trading":
    "交易",
  "Transaction failed":
    "交易失败",
  "Venue action failed":
    "交易平台操作失败",
  "Wallet holdings, venue positions and DeFi deposits appear here, marked to the live price.":
    "钱包持仓、交易平台头寸和 DeFi 存款会显示在这里，按实时价格计价。",
  "What's moving in crypto today?":
    "今天加密市场有什么动向？",
  "Why is {symbol} moving?":
    "{symbol} 为什么在波动？",
  "Writing the answer from the team's notes…":
    "正在根据团队的笔记撰写回答…",
  "Your {direction} {target} alert has been crossed{delivered}.":
    "你设置的{direction} {target} 提醒已被穿越{delivered}。",
  "Your accounts could not be read: {error}":
    "无法读取你的账户：{error}",
  "Your alert {direction} {target}{distance}.{more}":
    "你的提醒：{direction} {target}{distance}。{more}",
  "Your price alerts":
    "你的价格提醒",
  "Your price alerts · Elyra app":
    "你的价格提醒 · Elyra 应用",
  "Your price alerts · not delivered":
    "你的价格提醒 · 不发送",
  "Your price alerts · not delivered yet":
    "你的价格提醒 · 尚未送达",
  "Your price alerts · Telegram":
    "你的价格提醒 · Telegram",
  "Your wallet's transactions land here as they confirm, each linked to the explorer.":
    "你钱包的交易确认后会显示在这里，每笔都链接到浏览器。",
};
