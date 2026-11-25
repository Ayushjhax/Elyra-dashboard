import type { Messages } from "../../translate";

/* Simplified Chinese — the paper account and the Live / Paper switch: components/paper, and the order forms that follow it. */

export const paper: Messages = {
  "{available} available":
    "可用 {available}",
  "{count} could not be priced just now and count as flat.":
    "其中 {count} 个暂时无法获取价格，按持平计算。",
  "{positions} open on paper · {orders} resting orders.":
    "模拟持仓 {positions} 个 · 挂单 {orders} 笔。",
  "A paper trade: it goes to the paper account, whatever the top bar shows.":
    "这是一笔模拟交易：无论顶部栏显示哪个账户，它都进入模拟账户。",
  "A rule or a copy you set on paper stays on paper until you move it to live yourself.":
    "在模拟账户中设置的规则或跟单会一直保持模拟，直到你亲自转为实盘。",
  "Approve Elyra's trading key on Automation before trading live on Hyperliquid {network}.":
    "在 Hyperliquid {network} 上进行实盘交易前，请先在“自动化”中批准 Elyra 的交易密钥。",
  "Available {available}":
    "可用 {available}",
  "Claim {amount}":
    "领取 {amount}",
  "Claiming…":
    "正在领取…",
  "Closed result":
    "已平仓盈亏",
  "Equity {equity}":
    "权益 {equity}",
  "Live account":
    "实盘账户",
  "Live and Paper are separate accounts. Switch between them any time in the top bar.":
    "实盘和模拟是两个独立的账户，可随时在顶部栏切换。",
  "Margin in use":
    "已用保证金",
  "Not now":
    "暂不",
  "Open result":
    "持仓盈亏",
  "Paper account":
    "模拟账户",
  "Paper orders fill at Hyperliquid's live prices, less the fees and slippage a live order would pay.":
    "模拟订单按 Hyperliquid 的实时价格成交，并扣除实盘订单需要支付的手续费和滑点。",
  "Paper trade":
    "模拟交易",
  "Paper trade {symbol} {side}":
    "模拟交易 {symbol} {side}",
  "Paper trading":
    "模拟交易",
  "Paper trading.":
    "模拟交易中。",
  "Practicing with virtual funds — no real money at risk.":
    "正在用虚拟资金练习——不涉及任何真实资金。",
  "Reset balance":
    "重置余额",
  "Reset to {amount}":
    "重置为 {amount}",
  "Reset to {amount} on {date}.":
    "于 {date} 重置为 {amount}。",
  "See paper trades":
    "查看模拟交易",
  "Start the paper account again at {amount}? Past paper trades stay in your history; they no longer count toward the balance. Close or cancel anything open on paper first.":
    "将模拟账户重新从 {amount} 开始？过去的模拟交易仍保留在记录中，但不再计入余额。请先平掉或撤销模拟账户中所有未结的持仓和挂单。",
  "Start trading with {amount} in virtual funds. Test everything Elyra can do, with no real money at risk.":
    "用 {amount} 虚拟资金开始交易。体验 Elyra 的全部功能，不涉及任何真实资金。",
  "Started with {amount} on {date}.":
    "于 {date} 以 {amount} 开始。",
  "Switch to live":
    "切换到实盘",
  "Switch to paper":
    "切换到模拟",
  "The balance is the starting funds plus the result of every paper trade since then, after fees. Equity marks open positions to the mid now; a new paper order needs its margin from what is available.":
    "余额等于初始资金加上此后每一笔模拟交易扣除手续费后的盈亏。权益按当前中间价计算未平仓持仓；新的模拟订单需要从可用资金中占用保证金。",
  "This server sends no live orders, so an order on Live is refused. Switch to Paper to practise.":
    "此服务器不发送实盘订单，因此实盘账户的订单会被拒绝。请切换到模拟账户练习。",
  "Take-profit at {tp} · stop-loss at {sl}, held on paper and checked every five minutes.":
    "止盈 {tp} · 止损 {sl}，在模拟账户中保留，每五分钟检查一次。",
  "Trading account":
    "交易账户",
};
