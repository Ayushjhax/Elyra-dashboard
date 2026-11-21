import type { Messages } from "../../translate";

/* Simplified Chinese — copy trading: components/copy, app/automation/copy, lib/copy. */

export const copy: Messages = {
  "{coin} {side}":
    "{coin} {side}",
  "{coin} {side} · {interval}":
    "{coin} {side} · {interval}",
  "{count} people copy it":
    "{count} 人在跟单",
  "{count} positions open":
    "{count} 个持仓中",
  "{count} rules":
    "{count} 条规则",
  "{count} shared":
    "已分享 {count} 组",
  "{count} trades in {days} days":
    "{days} 天内 {count} 笔交易",
  "{open} open · {closed} closed":
    "持仓 {open} · 已平仓 {closed}",
  "{pct} won":
    "胜率 {pct}",
  "{size} · {maxLeverage}x":
    "{size} · {maxLeverage} 倍",
  "{size} a trade · up to {maxLeverage}x · {maxDriftPct}% allowance":
    "每笔 {size} · 最高 {maxLeverage} 倍 · 价格容差 {maxDriftPct}%",
  "1 person copies it":
    "1 人在跟单",
  "1 position open":
    "1 个持仓中",
  "1 rule":
    "1 条规则",
  "A set no longer shared":
    "已停止分享的规则组",
  "Allowance (%)":
    "价格容差（%）",
  "at {price}":
    "价格 {price}",
  "Average":
    "平均",
  "Backtest · not traded":
    "回测 · 未实际交易",
  "Bold":
    "积极",
  "By Elyra":
    "Elyra 运行",
  "by hand":
    "手动平仓",
  "Careful":
    "谨慎",
  "Change":
    "修改",
  "Change how you copy {name}":
    "修改跟单 {name} 的方式",
  "Choose one in Arena.":
    "前往竞技场设置。",
  "Copy {name}":
    "跟单 {name}",
  "Copy a rule set someone shares, or one of Elyra's own. When its rules enter, Elyra opens the same trade in your account on the same five-minute check — at your size, with the leader's take-profit and stop-loss — and closes it when the leader closes. Your account's limits on Your rules apply to every copy.":
    "跟单他人分享的规则组，或 Elyra 自己运行的规则组。当其规则开仓时，Elyra 会在同一次五分钟检查中在你的账户里开出同样的交易——按你的仓位大小，沿用带单方的止盈和止损——并在带单方平仓时一同平仓。你在“你的规则”中设置的账户限额适用于每一笔跟单。",
  "Copy a shared set of automation rules, or one of Elyra's own, into your own Hyperliquid account, and share sets of your own.":
    "将他人分享的自动化规则组或 Elyra 自己的规则组跟单到你自己的 Hyperliquid 账户，也可以分享你自己的规则组。",
  "Copy trading":
    "跟单交易",
  "Copy trading is unavailable":
    "跟单交易暂不可用",
  "Copying a leader is not advice, and no leader is vetted by Elyra. A copy fills later than the leader and at its own price, live fills can be worse than paper, and past results say nothing certain about future ones.":
    "跟单任何带单方都不构成建议，Elyra 也不审核带单方。跟单的成交晚于带单方，成交价也各不相同；实盘成交可能比模拟更差，过往结果不代表未来。",
  "Delete set":
    "删除规则组",
  "Delete this set? Its rules stay as they are. Anyone copying it stops getting new entries.":
    "删除这个规则组？其中的规则保持不变。跟单者将不再收到新的开仓。",
  "Each copy opens at your size, at the leader's leverage up to yours, with the leader's take-profit and stop-loss, and closes when the leader closes. It is skipped if the price is already more than your allowance past the leader's entry, between {min}% and {max}%.":
    "每笔跟单按你的仓位大小开仓，杠杆跟随带单方但不超过你的上限，沿用带单方的止盈和止损，并在带单方平仓时一同平仓。如果价格已经比带单方的开仓价不利地偏离超过你的价格容差（{min}% 至 {max}% 之间），这笔跟单将被跳过。",
  "Elyra fade · BTC short":
    "Elyra 逆势 · BTC 做空",
  "Elyra momentum · SOL and HYPE":
    "Elyra 动量 · SOL 与 HYPE",
  "Elyra trend · majors":
    "Elyra 趋势 · 主流币",
  "Every closed trade since the set was made, each as a return on its own margin, summed without compounding. Your result is your size times these, less your own fills.":
    "自规则组创建以来的每一笔已平仓交易，各以其自身保证金的收益率计，不复利直接相加。你的结果约等于你的仓位乘以这些收益率，再扣除你自己的成交差异。",
  "exit rule":
    "离场规则",
  "Follow a leader's trades in your own account":
    "在你自己的账户里跟随带单方的交易",
  "Follows BTC and ETH trends on four-hour bars: in on a MACD signal cross or a Parabolic SAR flip, out at the target, the stop or the reverse signal.":
    "在四小时 K 线上跟随 BTC 和 ETH 的趋势：MACD 信号线交叉或抛物线 SAR 翻转时入场，在目标价、止损价或反向信号出现时离场。",
  "Group your rules into sets, and share a set to let others copy it. A rule is in one set at most; it keeps trading as it does now.":
    "把你的规则分组，分享某一组即可让他人跟单。一条规则最多属于一个规则组，并照常交易。",
  "Hourly breakouts on SOL and HYPE: in when price closes outside its Bollinger Band or above its volume-weighted average, with a tighter target and stop.":
    "SOL 和 HYPE 的一小时突破：价格收于布林带之外或成交量加权均线之上时入场，目标价和止损更近。",
  "Its record":
    "交易记录",
  "Its rules":
    "其规则",
  "Its rules replayed on Hyperliquid's own bars over the last {days} days, with fees and slippage, as the five-minute check would have traded them. Hypothetical: past bars say nothing certain about the next ones.":
    "按五分钟检查的交易方式，在 Hyperliquid 自己最近 {days} 天的 K 线上重放这些规则，计入手续费和滑点。这是假设结果：过去的行情不代表未来。",
  "Keep copying":
    "继续跟单",
  "Latest trades":
    "最近交易",
  "Leaders":
    "带单方",
  "Leverage up to":
    "杠杆上限",
  "Live copies are real orders on Hyperliquid {network}, sent through the trading key you approved. They can lose money quickly.":
    "实盘跟单是通过你批准的交易密钥在 Hyperliquid {network} 上发出的真实订单，可能迅速亏损。",
  "Majors on the four-hour":
    "四小时主流币",
  "Make one on Your rules.":
    "在“你的规则”中创建。",
  "Make set":
    "创建规则组",
  "moves from {set}":
    "将从 {set} 移出",
  "New set":
    "新建规则组",
  "No closed trades yet":
    "尚无已平仓交易",
  "No sets are shared yet.":
    "还没有人分享规则组。",
  "Nothing yet. Its rules enter when their strategy does; a copy starts with the next entry.":
    "暂无交易。其规则在策略发出信号时开仓；跟单从下一次开仓开始。",
  "Optional. Followers read this before they copy.":
    "选填。跟单者会在跟单前阅读。",
  "Per trade ($)":
    "每笔（$）",
  "Private":
    "私有",
  "Record and rules":
    "记录与规则",
  "Rules in it":
    "包含的规则",
  "Sells BTC short when its 15-minute RSI is stretched to the upside, and buys back at a small target or stop: the other side of a crowded move.":
    "当 BTC 的 15 分钟 RSI 过度上冲时做空，在较近的目标价或止损价买回：站在拥挤行情的另一边。",
  "Share it so others can copy it":
    "分享，让他人可以跟单",
  "Share your own rules":
    "分享你自己的规则",
  "Shared":
    "已分享",
  "Sharing needs an Arena handle: a shared set is shown by your handle, never your wallet.":
    "分享需要竞技场昵称：分享的规则组以你的昵称展示，永远不会显示你的钱包。",
  "Shown as @{handle}. Others see its rules, entries, exits and returns on margin — never your sizes or your wallet.":
    "以 @{handle} 展示。其他人能看到它的规则、开平仓和保证金收益率——永远看不到你的仓位大小或钱包。",
  "Sign in to copy":
    "登录后跟单",
  "Sign in to group your automation rules into sets and let others copy them, shown by your Arena handle and never your wallet.":
    "登录后即可把你的自动化规则分组并让他人跟单，以你的竞技场昵称展示，永远不会显示你的钱包。",
  "Standard":
    "标准",
  "Start copying":
    "开始跟单",
  "Start from":
    "从预设开始",
  "stop":
    "止损",
  "Stop copying":
    "停止跟单",
  "Stop copying? Nothing new is copied. Copies already open keep their take-profit and stop-loss and still close when the leader closes.":
    "停止跟单？之后不再复制新的开仓。已开的跟单保留各自的止盈和止损，并仍会在带单方平仓时一同平仓。",
  "Summed":
    "累计",
  "target":
    "止盈",
  "The leader no longer shares this set, so nothing new is copied.":
    "带单方已停止分享这个规则组，因此不会再复制新的开仓。",
  "This server trades paper only, so copies run on paper.":
    "此服务器只进行模拟交易，因此跟单以模拟方式运行。",
  "This server trades paper only, so every copy runs on paper. Live copying is switched on by the deployment (Hyperliquid {network}).":
    "此服务器只进行模拟交易，因此所有跟单都以模拟方式运行。实盘跟单由部署开启（Hyperliquid {network}）。",
  "TP {takeProfitPct}% · SL {stopLossPct}% · {leverage}x":
    "止盈 {takeProfitPct}% · 止损 {stopLossPct}% · {leverage} 倍",
  "What it does":
    "说明",
  "Won":
    "胜率",
  "You copy":
    "你的跟单",
  "You copy it":
    "跟单中",
  "You have no rules yet.":
    "你还没有规则。",
  "Your rule sets":
    "你的规则组",
  "Your rules":
    "你的规则",
  "Your set":
    "你的规则组",
};
