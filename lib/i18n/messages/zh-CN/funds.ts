import type { Messages } from "../../translate";

/* Simplified Chinese — components/funds. */

export const funds: Messages = {
  " about a trade":
    " 关于一笔交易",
  " Paper fills pay Hyperliquid's taker fee and slippage.":
    " 模拟成交需支付 Hyperliquid 的吃单费和滑点。",
  "— a hedge fund's other half":
    "——对冲基金的另一半",
  "· Low ":
    "· 最低 ",
  "{amount} at {npu} a unit":
    "{amount}，单位净值 {npu}",
  "{author} wrote":
    "{author} 写道",
  "{coin} {side} · {size} at {price}":
    "{coin} {side} · {size}，价格 {price}",
  "{days} days on paper ({daysNeeded} needed) · {trades} closed trades ({tradesNeeded} needed).":
    "模拟盘 {days} 天（需 {daysNeeded} 天）· 已平仓交易 {trades} 笔（需 {tradesNeeded} 笔）。",
  "{direction} · {units} units at {npu} · {at}":
    "{direction} · {units} 份，单位净值 {npu} · {at}",
  "{maxOpenFunds} funds are running, the most at once. Wind one down to launch another.":
    "已有 {maxOpenFunds} 只基金在运行，已达上限。清盘一只后才能发起新的。",
  "{name} is trading on paper":
    "{name} 正在模拟盘交易",
  "{name} manager":
    "{name} 管理人",
  "{notionalUsd} · entry {entryPrice} · now {mark} · TP {takeProfit} · SL {stopLoss}":
    "{notionalUsd} · 入场 {entryPrice} · 现价 {mark} · 止盈 {takeProfit} · 止损 {stopLoss}",
  "{npu} a unit":
    "单位净值 {npu}",
  "{pct}% of NAV":
    "资产净值的 {pct}%",
  "{units} units at {npu}":
    "{units} 份，单位净值 {npu}",
  "${minCapitalUsd} to ${maxPaperCapitalUsd}. Units start at 100, so returns are the manager's, whatever you add later.":
    "${minCapitalUsd} 至 ${maxPaperCapitalUsd}。份额从 100 起算，因此无论你之后追加多少，收益都属于管理人的表现。",
  "100 · start":
    "100 · 起点",
  "A live fund's capital is an allocation of your own Hyperliquid account. Nothing moves: adding claims more of the account for the fund, withdrawing gives it back. Elyra's key there cannot withdraw.":
    "实盘基金的资金是从你自己的 Hyperliquid 账户中划出的配额。资金不会移动：追加就是为基金划出更多账户资金，取出就是归还。Elyra 在那里的密钥无法提现。",
  "a position has no live price; marked at its entry":
    "有头寸没有实时价格，按入场价标记",
  "A tighter limit stops new positions at once; open ones run to their own exits. The change is in your ledger.":
    "收紧限额会立即停止新开仓；已开头寸按各自的出场条件运行。此变更会记入你的账本。",
  "Add":
    "追加",
  "Add capital":
    "追加资金",
  "Add or withdraw":
    "追加或取出",
  "Agent key":
    "代理密钥",
  "All funds":
    "所有基金",
  "all positions, × NAV · up to {maxGrossExposure}×":
    "全部头寸，× 资产净值 · 最高 {maxGrossExposure}×",
  "Allowed":
    "允许",
  "Amount in USD":
    "金额（美元）",
  "An agent":
    "一个代理",
  "An AI manages the fund; you own it; Elyra runs the back office and the risk desk. Every order is held to the charter you write, the book is marked to market every five minutes, and the fund is halted and flattened at its drawdown limit. Your capital never leaves your own account.":
    "AI 管理基金；你拥有它；Elyra 负责后台和风控。每笔订单都必须符合你撰写的章程，账簿每五分钟按市价估值一次，基金在触及回撤限额时会被熔断并清仓。你的资金从不离开你自己的账户。",
  "Assign one later":
    "稍后分配",
  "at once · 1–{maxPositions}":
    "同时持有 · 1–{maxPositions} 个",
  "Capital":
    "资金",
  "Capital added":
    "已追加资金",
  "Capital withdrawn":
    "已取出资金",
  "Change manager":
    "更换管理人",
  "Change the charter":
    "修改章程",
  "Charter":
    "章程",
  "Charter changed":
    "章程已修改",
  "checked in {managerSeenAt}":
    "签到于 {managerSeenAt}",
  "Close every position and the fund":
    "平掉所有头寸并关闭基金",
  "Close now":
    "立即平仓",
  "Closed and graduated":
    "已关闭和已转实盘",
  "Closed out":
    "已关闭",
  "Closed trades":
    "已平仓交易",
  "Closing":
    "正在平仓",
  "Confirming entry":
    "正在确认入场",
  "Copy the manager's instructions":
    "复制管理人的指令",
  "Daily loss limit":
    "每日亏损限额",
  "Day's closing NAV sealed":
    "当日收盘资产净值已密封",
  "Days":
    "天数",
  "Drawdown from the high":
    "相对高点的回撤",
  "Elyra is closing what is left and will close the fund out once it is flat, within five minutes.":
    "Elyra 正在平掉剩余头寸，空仓后会在五分钟内关闭基金。",
  "Every event in this fund's life — orders taken and refused, closes, capital, charter changes, each day's closing NAV — in your hash-chained ledger, where it cannot be rewritten.":
    "这只基金生命周期中的每个事件——接受和拒绝的订单、平仓、资金、章程变更、每日收盘资产净值——都记录在你的哈希链账本中，无法改写。",
  "Flat. Positions the manager opens appear here with their take-profit and stop-loss.":
    "空仓。管理人开的头寸会连同止盈和止损显示在这里。",
  "from its high · {minDrawdownPct}–{maxDrawdownPct}%. Elyra closes everything.":
    "相对高点 · {minDrawdownPct}–{maxDrawdownPct}%。Elyra 会平掉所有头寸。",
  "Fund manager":
    "基金管理人",
  "Funds are private to the account that runs them.":
    "基金仅对运营它的账户可见。",
  "Funds are unavailable":
    "基金暂不可用",
  "Graduate":
    "转为实盘",
  "Graduate to live":
    "转为实盘",
  "Graduated":
    "已转实盘",
  "Graduated — open the live fund":
    "已转为实盘——打开实盘基金",
  "Graduated to live":
    "已转为实盘",
  "Graduating":
    "正在转为实盘",
  "Gross exposure":
    "总敞口",
  "halt at {pct}%":
    "{pct}% 熔断",
  "Halt at drawdown":
    "回撤熔断",
  "Halted at the drawdown limit":
    "触及回撤限额，已熔断",
  "Halted by Elyra. {haltReason} Every position was closed. It opens nothing until you resume it.":
    "已被 Elyra 熔断。{haltReason}所有头寸均已平仓。在你恢复之前，它不会开任何新仓。",
  "Has not checked in yet.":
    "尚未签到。",
  "In":
    "转入",
  "Incubate":
    "孵化",
  "Incubated on paper first — see that record":
    "先在模拟盘孵化——查看该记录",
  "Into your own Hyperliquid account.":
    "进入你自己的 Hyperliquid 账户。",
  "It has no manager yet. Assign one from the fund's page — until then, nothing trades.":
    "它还没有管理人。请在基金页面分配一个——在此之前不会进行任何交易。",
  "Its manager's key already exists; the fund's page has the instructions to give the agent.":
    "它的管理人密钥已经存在；基金页面上有要交给代理的指令。",
  "Journal entry":
    "日志条目",
  "Largest position":
    "最大单一头寸",
  "Last checked in {managerSeenAt}.":
    "上次签到 {managerSeenAt}。",
  "Launch a fund":
    "发起基金",
  "Launch on paper":
    "在模拟盘发起",
  "Launched":
    "已成立",
  "launched {createdAt}":
    "成立于 {createdAt}",
  "Launching":
    "正在发起",
  "Leverage":
    "杠杆",
  "Lifecycle":
    "生命周期",
  "Live capital in USD":
    "实盘资金（美元）",
  "Live capital, USD":
    "实盘资金（美元）",
  "Make a key for a new AI manager":
    "为新的 AI 管理人创建密钥",
  "Manager":
    "管理人",
  "Manager changed":
    "已更换管理人",
  "Manager key":
    "管理人密钥",
  "Manager's journal":
    "管理人日志",
  "Markets":
    "市场",
  "Markets it may trade · {count} chosen":
    "可交易的市场 · 已选 {count} 个",
  "Max drawdown":
    "最大回撤",
  "May sell short":
    "可以做空",
  "Name of the manager's key":
    "管理人密钥名称",
  "NAV per unit":
    "单位净值",
  "NAV per unit from {at} to {at2}: from {npu} to {npu2}, high {hi}, low {lo}.":
    "从 {at} 到 {at2} 的单位净值：从 {npu} 到 {npu2}，最高 {hi}，最低 {lo}。",
  "NAV per unit, now {npu}":
    "单位净值，当前 {npu}",
  "Net asset value":
    "资产净值",
  "New fund":
    "新建基金",
  "No funds running. Launch one on paper: write its brief and limits, and connect the AI that will manage it.":
    "没有运行中的基金。在模拟盘发起一只：撰写简报和限额，并连接将要管理它的 AI。",
  "No manager":
    "无管理人",
  "No manager. Nothing trades until an agent key is assigned.":
    "没有管理人。在分配代理密钥之前不会进行任何交易。",
  "Not allowed":
    "不允许",
  "nothing new until 00:00 UTC · {minDailyLossPct}–{maxDailyLossPct}%":
    "00:00 UTC 之前不再开新仓 · {minDailyLossPct}–{maxDailyLossPct}%",
  "Nothing yet. The manager's reasons for each trade and its notes appear here, in its own words.":
    "还什么都没有。管理人每笔交易的理由和笔记会以它自己的话显示在这里。",
  "now.":
    "。",
  "of NAV · {minPositionPct}–{maxPositionPct}%":
    "占资产净值 · {minPositionPct}–{maxPositionPct}%",
  "On paper, at real prices, at least {days} days.":
    "在模拟盘以真实价格运行至少 {days} 天。",
  "Open the fund":
    "打开基金",
  "Operate":
    "运营",
  "Order failed":
    "订单失败",
  "Order refused by the charter":
    "订单被章程拒绝",
  "Out":
    "转出",
  "Paper capital. Adding or withdrawing buys or redeems units at today's NAV per unit, so the fund's return is unchanged.":
    "模拟资金。追加或取出会按今天的单位净值申购或赎回份额，因此基金的收益不变。",
  "Pause":
    "暂停",
  "Pausing stops new positions; open ones keep their exits. Resuming from a halt restarts the drawdown and the day's loss from today's NAV. Winding down closes everything now and freezes the record.":
    "暂停会停止新开仓；已开头寸保留其出场条件。从熔断中恢复会以今天的资产净值重新计算回撤和当日亏损。清盘会立即平掉所有头寸并冻结记录。",
  "per position · 1–{maxLeverage}x":
    "每个头寸 · 1–{maxLeverage} 倍",
  "Per unit, so capital you add or take out never counts as return. Sharpe and volatility are annualised from daily closes and appear after five days.":
    "按单位计算，因此你追加或取出的资金永远不会计入收益。夏普比率和波动率由每日收盘值年化，满五天后显示。",
  "Position closed":
    "已平仓",
  "Position opened":
    "已开仓",
  "Put in":
    "投入",
  "Realised":
    "已实现",
  "result pending":
    "结果待定",
  "Resume":
    "恢复",
  "Resume from the halt":
    "从熔断中恢复",
  "Resumed":
    "已恢复",
  "Return":
    "收益",
  "Run the agent on a schedule — every hour, say — and the fund is managed while you are away. Elyra marks it, holds it to its charter and halts it at its drawdown limit whether or not the agent is running.":
    "让代理按计划运行——比如每小时一次——你不在时基金也有人管理。无论代理是否在运行，Elyra 都会为它估值、确保它遵守章程，并在触及回撤限额时熔断。",
  "Save the charter":
    "保存章程",
  "Saving":
    "正在保存",
  "Sealed record":
    "密封记录",
  "Sharpe":
    "夏普比率",
  "Shorts":
    "做空",
  "Sign in to run AI funds":
    "登录后运营 AI 基金",
  "Sign in to see this fund":
    "登录后查看这只基金",
  "Since launch, per unit":
    "自成立以来，每单位",
  "Standing instructions for the agent":
    "给代理的常设指令",
  "Starting capital, on paper (USD)":
    "初始资金，模拟盘（美元）",
  "Statement CSV":
    "对账单 CSV",
  "stop at -{pct}%":
    "-{pct}% 止损",
  "Taken out":
    "取出",
  "The agent connects to":
    "代理使用其密钥连接到",
  "The AI manager reads this first, every time. {count}/{maxObjectiveChars}":
    "AI 管理人每次都会先读这段内容。{count}/{maxObjectiveChars}",
  "The AI trades; Elyra marks, limits and halts.":
    "AI 负责交易；Elyra 负责估值、限额和熔断。",
  "The chart starts once the fund has two hourly marks.":
    "基金有两个小时级标记后开始显示图表。",
  "The manager may open a position of up to":
    "管理人当前可开的头寸最高为",
  "The manager's brief":
    "管理人简报",
  "The paper fund closes with its record frozen, and a live fund opens with the same charter and manager, trading the capital you allocate from your own Hyperliquid account — so a live record never contains paper results.":
    "模拟基金关闭并冻结记录，同时开设一只章程和管理人都相同的实盘基金，用你从自己 Hyperliquid 账户划出的资金交易——因此实盘记录绝不包含模拟结果。",
  "The statement could not be exported just now.":
    "暂时无法导出对账单。",
  "This fund could not be opened":
    "无法打开这只基金",
  "This is the manager's key. It is shown once — Elyra keeps only its hash. Connect your agent with it, then give the agent its instructions.":
    "这是管理人的密钥。它只显示一次——Elyra 只保存其哈希。用它连接你的代理，然后把指令交给代理。",
  "This server trades paper only, so funds can incubate but not graduate. Live trading is switched on by the deployment (Hyperliquid {network}).":
    "此服务器只支持模拟交易，因此基金可以孵化但无法转为实盘。实盘交易由部署方开启（Hyperliquid {network}）。",
  "Trend book":
    "趋势账簿",
  "up to {count}":
    "最多 {count} 个",
  "up to {leverage}x":
    "最高 {leverage} 倍",
  "Use one of my agent keys":
    "使用我已有的代理密钥",
  "Volatility":
    "波动率",
  "What the fund is for and how it should trade. For example: follow multi-day trends in BTC and ETH, long or short; never more than two positions; cut a loser at its stop rather than averaging down.":
    "这只基金的用途和交易方式。例如：跟踪 BTC 和 ETH 的多日趋势，可做多或做空；持仓不超过两个；亏损头寸在止损处离场，而不是摊低成本。",
  "Whole ledger":
    "完整账本",
  "Wind down":
    "清盘",
  "Wind down to flat, the record frozen.":
    "清盘至空仓，冻结记录。",
  "Wind-down started":
    "已开始清盘",
  "Winding down":
    "正在清盘",
  "with its key and sees this fund's four tools. Keys are made and revoked in ":
    "，并看到这只基金的四个工具。密钥的创建和撤销在 ",
  "Write a charter, give an AI agent the fund to manage, and let Elyra hold it to the charter — on paper first, then in your own Hyperliquid account.":
    "撰写章程，把基金交给 AI 代理管理，并由 Elyra 确保它遵守章程——先在模拟盘，再进入你自己的 Hyperliquid 账户。",
  "You write the brief and the limits.":
    "你撰写简报和限额。",
  "You write the charter; an AI agent manages the fund inside it; Elyra holds every order to it, marks the book every five minutes and halts the fund at its drawdown limit. Every fund starts on paper at Hyperliquid's prices, after fees. After {minIncubationDays} days and {minIncubationTrades} closed trades it can graduate to your own Hyperliquid account.":
    "你撰写章程；AI 代理在章程内管理基金；Elyra 确保每笔订单符合章程，每五分钟为账簿估值一次，并在触及回撤限额时熔断基金。每只基金都从模拟盘开始，按 Hyperliquid 的价格扣除费用后计算。满 {minIncubationDays} 天且有 {minIncubationTrades} 笔已平仓交易后，可以转入你自己的 Hyperliquid 账户进行实盘交易。",
  "Your account-wide limits on the Automation page apply to the fund too.":
    "你在“自动化”页面设置的账户级限额同样适用于基金。",
  "Your funds":
    "你的基金",
};
