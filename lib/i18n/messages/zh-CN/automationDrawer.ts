import type { Messages } from "../../translate";

/* Simplified Chinese — the Automation drawer's six views: overview, the
   trading key and its approval, rules, order entry, trade history and its
   analysis (components/automation). */

export const automationDrawer: Messages = {
  "{name} was created on paper. It is under Rules.":
    "{name} 已以模拟模式创建，可在“规则”下查看。",
  "{side} {market} opened ({mode}). It is under Trade history.":
    "{market} {side} 已开仓（{mode}），可在“交易记录”下查看。",
  "{sizeUsd} at {leverage}x · TP {takeProfit} · SL {stopLoss}":
    "{sizeUsd}，{leverage}x · 止盈 {takeProfit} · 止损 {stopLoss}",
  "Agent":
    "代理",
  "agent address":
    "代理地址",
  "All outcomes":
    "全部结果",
  "Approve key":
    "批准密钥",
  "Approved {age}. Remove it on Hyperliquid at any time.":
    "已于{age}批准。你可随时在 Hyperliquid 上移除它。",
  "Approved. Remove it on Hyperliquid at any time.":
    "已批准。你可随时在 Hyperliquid 上移除它。",
  "account address":
    "账户地址",
  "Cancel orders on your account":
    "撤销你账户上的订单",
  "Checked every five minutes":
    "每五分钟检查一次",
  "Choose how Elyra trades this rule.":
    "选择 Elyra 按这条规则交易的方式。",
  "Continue to wallet":
    "前往钱包",
  "Create paper rule":
    "创建模拟规则",
  "Default parameters; test it in Research → Backtests first.":
    "默认参数；请先在“研究 → 回测”中测试。",
  "Elyra · API wallet":
    "Elyra · API 钱包",
  "Engine":
    "引擎",
  "Enter a whole number from 1 to {max}.":
    "请输入 1 到 {max} 之间的整数。",
  "Enter an amount from $1 to ${max}.":
    "请输入 $1 到 ${max} 之间的金额。",
  "Entries and limits":
    "入场与限额",
  "Every entry, exit and failure is sent to your notifications, your phone and your linked Telegram chat, whatever your alert settings.":
    "每次入场、出场和失败都会发送到你的通知、手机和已关联的 Telegram 聊天，不受提醒设置影响。",
  "Filter the history":
    "筛选记录",
  "From the 1 closed paper trade in the history above, as filtered.":
    "基于上方记录中按当前筛选得到的 1 笔已平仓模拟交易。",
  "From the {count} closed paper trades in the history above, as filtered.":
    "基于上方记录中按当前筛选得到的 {count} 笔已平仓模拟交易。",
  "Group":
    "分组",
  "Held":
    "持有时长",
  "Hyperliquid Mainnet":
    "Hyperliquid 主网",
  "Hyperliquid Testnet":
    "Hyperliquid 测试网",
  "Inspect payload":
    "查看载荷",
  "Isolated margin. Paper trades pay an estimated taker fee and slippage on every fill.":
    "逐仓保证金。模拟交易的每次成交都会计入估算的吃单手续费和滑点。",
  "It can place and cancel orders on your Hyperliquid account. It cannot withdraw or transfer funds.":
    "它可以在你的 Hyperliquid 账户上下单和撤单，不能提取或转移资金。",
  "Leader closed it":
    "由带单者平仓",
  "Limits saved.":
    "限额已保存。",
  "Live · {network}":
    "实盘 · {network}",
  "Live fills pay Hyperliquid's own fees, already in the result.":
    "实盘成交支付 Hyperliquid 自身的手续费，已计入结果。",
  "Live on Hyperliquid {network}":
    "在 Hyperliquid {network} 实盘",
  "Live orders also need this server to send them; until then, rules and orders run on paper.":
    "实盘订单还需要本服务器开启发送；在此之前，规则和订单都以模拟方式运行。",
  "Live orders are unavailable on this server.":
    "本服务器不提供实盘订单。",
  "Live orders need the trading key approved.":
    "实盘订单需要先批准交易密钥。",
  "Live rules and live orders go through an API wallet you approve from your own wallet. It can place and cancel orders on your Hyperliquid account and cannot withdraw or transfer anything.":
    "实盘规则和实盘订单通过你用自己钱包批准的 API 钱包执行。它可以在你的 Hyperliquid 账户上下单和撤单，不能提取或转移任何资产。",
  "Market and terms":
    "市场与条件",
  "Max open positions":
    "最多持仓数",
  "Modeled costs {total}: taker fees {fees} and slippage {slippage}, already in the result.":
    "模拟成本 {total}：吃单手续费 {fees}，滑点 {slippage}，已计入结果。",
  "No trades match these filters.":
    "没有符合这些筛选条件的交易。",
  "None of the trades these filters show is a closed paper trade.":
    "当前筛选显示的交易中没有已平仓的模拟交易。",
  "Open at (price, $)":
    "开仓价（价格，$）",
  "Order entry":
    "下单",
  "P&L (USD)":
    "盈亏（USD）",
  "Paper and live":
    "模拟与实盘",
  "Paper only":
    "仅模拟",
  "Paper results by leverage, side, entry time, exit and market":
    "按杠杆、方向、入场时间、出场方式和市场划分的模拟结果",
  "Pausing stops every new entry: rules at their next check, and Trade now and new limit orders at once. Open positions keep their take-profit, stop-loss and exit rule, and you can still close them by hand. Orders already resting — live on Hyperliquid or on paper — can still fill; cancel them under Order entry.":
    "暂停会停止所有新的入场：规则在下一次检查时停止，“立即交易”和新的限价单则立即停止。已开仓位保留其止盈、止损和出场规则，你仍可手动平仓。已挂出的订单（Hyperliquid 实盘或模拟）仍可能成交；请在“下单”中撤销。",
  "payload":
    "载荷",
  "Payload":
    "载荷",
  "Permissions":
    "权限",
  "Place orders on your Hyperliquid perps":
    "在你的 Hyperliquid 永续合约上下单",
  "Placing…":
    "正在下单…",
  "Preparing the key":
    "正在准备密钥",
  "Resume entries":
    "恢复入场",
  "Review and approve":
    "查看并批准",
  "Review the {market} {side} trade":
    "复核这笔 {market} {side} 交易",
  "Review what this key can do, then continue to your wallet to sign.":
    "先查看这把密钥能做什么，再前往钱包签名。",
  "Rules start on paper. Switch one to live from its row once it has earned it.":
    "规则从模拟开始。表现足够好后，可在该规则所在行切换为实盘。",
  "Stop-loss (% from entry)":
    "止损（距入场价 %）",
  "Stop-loss (% from fill)":
    "止损（距成交价 %）",
  "Stop-loss (price, $)":
    "止损（价格，$）",
  "Take-profit (% from entry)":
    "止盈（距入场价 %）",
  "Take-profit (% from fill)":
    "止盈（距成交价 %）",
  "Take-profit (price, $)":
    "止盈（价格，$）",
  "The exact request your wallet is asked to sign.":
    "你的钱包将被要求签名的确切请求。",
  "Trade history":
    "交易记录",
  "Trading key approval":
    "批准交易密钥",
  "Transfer funds to another address or account":
    "将资金转移到其他地址或账户",
  "What Hyperliquid lets an API wallet do on your account.":
    "Hyperliquid 允许 API 钱包在你的账户上执行的操作。",
  "What it trades, on which bars, and how much.":
    "交易什么、按哪种 K 线周期、交易多少。",
  "Withdraw funds":
    "提取资金",
  "You can remove it on Hyperliquid at any time. A rule's market, size, leverage and exits are set in the rule editor; they are not part of this key.":
    "你可随时在 Hyperliquid 上移除它。规则的市场、规模、杠杆和出场条件在规则编辑器中设置，不属于这把密钥。",
  "You have {count} rules, the most allowed. Delete one to add another.":
    "你已有 {count} 条规则，已达上限。删除一条后才能再添加。",
  "Your Hyperliquid account":
    "你的 Hyperliquid 账户",
  "Your limit orders":
    "你的限价单",
  "Your rule":
    "你的规则",
};
