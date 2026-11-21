import type { Messages } from "../../translate";

/* Simplified Chinese — components/automation. */

export const automation: Messages = {
  " Rules are checked every five minutes. {open}":
    "规则每五分钟检查一次。{open}",
  "· key":
    "· 密钥",
  "· out {exitPrice} ({reason})":
    "· 出场 {exitPrice}（{reason}）",
  "{count} of {maxRulesPerAccount}":
    "{count}/{maxRulesPerAccount}",
  "{label} bleeds:":
    "{label} 亏钱：",
  "{label} pays:":
    "{label} 赚钱：",
  "{netPnlUsd} over {trades} trades, {winRate} won.":
    "{trades} 笔交易共 {netPnlUsd}，胜率 {winRate}。",
  "{side} · {strategy} · {coin} {interval} · {size} at {leverage}x · TP {tp}% · SL {sl}%":
    "{side} · {strategy} · {coin} {interval} · {size}，{leverage} 倍 · 止盈 {tp}% · 止损 {sl}%",
  "{side} {coin} at {price}":
    "{side} {coin}，价格 {price}",
  "{side} {market} opened ({mode}). It is under Trades.":
    "已开仓：{side} {market}（{mode}）。可在“交易”中查看。",
  "{sizeUsd} at {leverage}x · TP {takeProfit} · SL {stopLoss} · {mode}":
    "{sizeUsd}，{leverage} 倍 · 止盈 {takeProfit} · 止损 {stopLoss} · {mode}",
  "A long waits below the current price and a short above it. Live orders rest on Hyperliquid and fill there even when Elyra is closed; the take-profit and stop-loss attach the moment it fills. Paper orders fill at the next five-minute check after the price trades through the level.":
    "做多挂单需低于当前价，做空挂单需高于当前价。实盘订单挂在 Hyperliquid 的订单簿上，即使 Elyra 关闭也会在那里成交；成交后立即附加止盈和止损。模拟订单会在价格穿过该价位后的下一次五分钟检查时成交。",
  "Above the entry":
    "高于入场价",
  "Above the market":
    "高于市价",
  "Add rule":
    "添加规则",
  "Approve Elyra's trading key":
    "批准 Elyra 的交易密钥",
  "Approve trading key":
    "批准交易密钥",
  "Approved":
    "已批准",
  "Automated trading can lose money quickly. Paper results estimate fees and slippage; live fills can be worse, and a price that gaps past a stop fills beyond it. Past results say nothing certain about future ones.":
    "自动交易可能迅速亏损。模拟结果估算了手续费和滑点；实盘成交可能更差，跳空越过止损的价格会以更差的价格成交。过往结果不能确定地说明未来。",
  "Automation is unavailable":
    "自动化暂不可用",
  "Average hold":
    "平均持仓时长",
  "Average loss":
    "平均亏损",
  "Average win":
    "平均盈利",
  "Back to paper":
    "切回模拟",
  "Below the entry":
    "低于入场价",
  "Below the market":
    "低于市价",
  "Best trade":
    "最佳交易",
  "BTC RSI dip":
    "BTC RSI 抄底",
  "By entry time":
    "按入场时间",
  "By exit":
    "按出场方式",
  "By leverage":
    "按杠杆",
  "By market":
    "按市场",
  "Cancel order":
    "撤单",
  "Cancelled":
    "已取消",
  "Cancelled — nothing was approved.":
    "已取消——未批准任何内容。",
  "Closed by you":
    "由你平仓",
  "Closed outside Elyra":
    "在 Elyra 之外平仓",
  "Daily loss limit ($)":
    "每日亏损限额（$）",
  "Delete":
    "删除",
  "Delete {name}":
    "删除 {name}",
  "entries {label} — {winRate} won, {netPnlUsd} over {trades} trades.":
    "在 {label} 入场——胜率 {winRate}，{trades} 笔交易共 {netPnlUsd}。",
  "Entry: {entry} Exit: {exit}":
    "入场：{entry} 出场：{exit}",
  "Entry: {entry} Exit: {exit} Default parameters; test it in Research → Backtests first.":
    "入场：{entry} 出场：{exit} 默认参数；请先在“研究 → 回测”中测试。",
  "Exit rule":
    "出场规则",
  "Failed":
    "失败",
  "Fewer than 20 closed trades: treat every split below as noise until there are more.":
    "已平仓交易少于 20 笔：在数量增加之前，下面的每项细分都只当作噪声。",
  "Filled":
    "已成交",
  "From your backtest: {strategy} on {market}, {interval} bars, with the parameters you tested ({params}).":
    "来自你的回测：{strategy}，{market}，{interval} K 线，沿用你测试过的参数（{params}）。",
  "Go live":
    "转为实盘",
  "Hyperliquid accepts this only from an account that has deposited.":
    "Hyperliquid 只接受已入金账户的批准。",
  "In {entryPrice} · TP {takeProfit} · SL {stopLoss}":
    "入场 {entryPrice} · 止盈 {takeProfit} · 止损 {stopLoss}",
  "Isolated margin. New rules start on paper; switch one to live from its row once it has earned it. Paper trades pay an estimated taker fee and slippage on every fill.":
    "逐仓保证金。新规则从模拟盘开始；表现达标后，可在该行切换为实盘。模拟交易在每次成交时都会扣除估算的吃单费和滑点。",
  "It can place and cancel orders on your Hyperliquid account. It cannot withdraw.":
    "它可以在你的 Hyperliquid 账户上下单和撤单，无法提现。",
  "Leverage (1–{maxLeverage}x)":
    "杠杆（1–{maxLeverage} 倍）",
  "Limit orders":
    "限价单",
  "Live — not available":
    "实盘——不可用",
  "Live ({network})":
    "实盘（{network}）",
  "live {network}":
    "实盘 {network}",
  "live {value}":
    "实盘 {value}",
  "Live rules trade on Hyperliquid {network}. Paper rules trade nothing and record what would have happened.":
    "实盘规则在 Hyperliquid {network} 上交易。模拟规则不进行任何交易，只记录本会发生的结果。",
  "Live rules trade through an API wallet you approve from your own wallet. It can place and cancel orders on your Hyperliquid account and cannot withdraw or transfer anything. You can remove it on Hyperliquid at any time.":
    "实盘规则通过你从自己钱包批准的 API 钱包进行交易。它可以在你的 Hyperliquid 账户上下单和撤单，无法提现或转移任何资产。你可以随时在 Hyperliquid 上移除它。",
  "Long — buy, profit when it rises":
    "做多——买入，上涨获利",
  "Long now":
    "立即做多",
  "Long vs short":
    "多空对比",
  "Mode":
    "模式",
  "Most open positions":
    "最多持仓数",
  "Net result":
    "净结果",
  "New rule":
    "新规则",
  "No closed paper trades yet. Once some close, this shows your real win rate, which leverage pays and which bleeds, long against short, and the hours you trade best.":
    "还没有已平仓的模拟交易。一旦有交易平仓，这里会显示你真实的胜率、哪种杠杆赚钱哪种亏钱、多空对比，以及你交易表现最好的时段。",
  "No leverage band or time window has the five trades it takes to call it yet.":
    "还没有哪个杠杆区间或时间段攒够五笔交易，暂时无法下结论。",
  "No rules yet. Add one below — it starts on paper.":
    "还没有规则。在下方添加一条——它会从模拟盘开始。",
  "Not approved":
    "未批准",
  "Nothing traded yet. Entries appear here as rules fire.":
    "还没有交易。规则触发后，入场会显示在这里。",
  "Off":
    "关",
  "on Hyperliquid {network}":
    "位于 Hyperliquid {network}",
  "Open":
    "持仓中",
  "Open at ($)":
    "开仓价（$）",
  "open. Every entry, exit and failure is sent to your notifications, your phone and your linked Telegram chat, whatever your alert settings.":
    "持仓中。每次入场、出场和失败都会发送到你的通知、手机和已关联的 Telegram 聊天，不受提醒设置影响。",
  "Opening":
    "正在开仓",
  "Opens at the market now, isolated margin, with the take-profit and stop-loss set from the fill and placed on Hyperliquid in the same request. Stock markets are trade[XYZ] perps — contracts that track the share price, not shares — and keep their own margin on Hyperliquid.":
    "立即按市价开仓，逐仓保证金，止盈和止损按成交价设置，并在同一请求中提交到 Hyperliquid。股票市场是 trade[XYZ] 永续合约——跟踪股价的合约，而非股票本身——在 Hyperliquid 上单独计算保证金。",
  "paper":
    "模拟",
  "Paper":
    "模拟",
  "Paper trade analysis":
    "模拟交易分析",
  "Paper trades only, after estimated fees and slippage. Win rate counts a trade as a win when it closed above zero after costs.":
    "仅模拟交易，已扣除估算的手续费和滑点。扣除成本后收益为正即计为盈利交易。",
  "Past the day's loss limit no rule enters again until 00:00 UTC.":
    "超过当日亏损限额后，任何规则在 00:00 UTC 之前都不会再入场。",
  "Pause all entries":
    "暂停所有入场",
  "Paused":
    "已暂停",
  "Pausing automation does not cancel resting live orders — cancel them here.":
    "暂停自动化不会撤销挂单中的实盘订单——请在这里撤单。",
  "Pausing stops new entries at the next check. Open positions keep their take-profit and stop-loss.":
    "暂停后，下一次检查起不再有新入场。已开仓头寸保留其止盈和止损。",
  "Place limit order":
    "下限价单",
  "position is":
    "个头寸",
  "positions are":
    "个头寸",
  "Profit factor":
    "盈利因子",
  "Resume automation":
    "恢复自动化",
  "Rules":
    "规则",
  "Running":
    "运行中",
  "Save limits":
    "保存限额",
  "Set rules once and Elyra checks them every five minutes, entering with take-profit and stop-loss attached.":
    "规则设置一次，Elyra 每五分钟检查一次，入场时附带止盈和止损。",
  "Sharpest timing:":
    "最佳时机：",
  "Short — sell, profit when it falls":
    "做空——卖出，下跌获利",
  "Short now":
    "立即做空",
  "Shorts run this rule on the price chart turned upside down: every rise is read as a fall, so “{value}” is taken with above and below swapped. Backtests are long-only, so a short rule has no backtest — run it on paper first.":
    "做空规则会在上下翻转的价格图上运行这条规则：每次上涨都被视为下跌，因此“{value}”中的高于和低于会互换。回测只支持做多，所以做空规则没有回测——请先在模拟盘运行。",
  "Sign in to automate trading":
    "登录后即可自动交易",
  "Size ($)":
    "规模（$）",
  "Stop-loss":
    "止损",
  "Stop-loss (%)":
    "止损（%）",
  "Stop-loss ($)":
    "止损价（$）",
  "Strategy":
    "策略",
  "Take-profit":
    "止盈",
  "Take-profit (%)":
    "止盈（%）",
  "Take-profit ($)":
    "止盈价（$）",
  "The approval did not complete.":
    "批准未完成。",
  "This account has no EVM wallet to hold a Hyperliquid account.":
    "此账户没有可用于 Hyperliquid 账户的 EVM 钱包。",
  "This server sends no live orders: every rule runs on paper and records what would have happened.":
    "此服务器不发送实盘订单：所有规则都在模拟盘运行，并记录本会发生的结果。",
  "Timeframe":
    "时间周期",
  "trade":
    "笔交易",
  "Trade now":
    "立即交易",
  "trades":
    "笔交易",
  "Trades":
    "交易",
  "Trading key":
    "交易密钥",
  "Turn off":
    "关闭",
  "Turn on":
    "开启",
  "Waiting":
    "等待中",
  "Waiting for your wallet":
    "等待你的钱包",
  "Win rate":
    "胜率",
  "Worst trade":
    "最差交易",
};
