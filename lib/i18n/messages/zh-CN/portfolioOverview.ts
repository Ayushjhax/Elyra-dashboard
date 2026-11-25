import type { Messages } from "../../translate";

/* Simplified Chinese — components/portfolio/overview: the accounts panel, the
   performance chart and calendar, and the workbook export. */

export const portfolioOverview: Messages = {
  "{count} assets":
    "{count} 种资产",
  "{count} days could not be measured.":
    "有 {count} 天无法计算。",
  "{count} intervals are left out of PnL and return: their deposits and withdrawals could not be read.":
    "有 {count} 个区间未计入盈亏和收益：无法读取其充值和提现。",
  "{count} markets":
    "{count} 个市场",
  "{count} open positions":
    "{count} 个未平仓头寸",
  "{day} so far: {value}":
    "{day} 截至目前：{value}",
  "{day}: {value}":
    "{day}：{value}",
  "{day}: not measured":
    "{day}：未计算",
  "{label} from {from} to {to}: from {start} to {end}.":
    "{label}，{from} 至 {to}：从 {start} 到 {end}。",
  "{label}, now {value}":
    "{label}，当前 {value}",
  "{profit} won · {loss} lost":
    "盈利 {profit} · 亏损 {loss}",
  "{wins} of {count} trades":
    "{count} 笔交易中盈利 {wins} 笔",
  "{wins} of 1 trade":
    "1 笔交易中盈利 {wins} 笔",
  "1 asset":
    "1 种资产",
  "1 day could not be measured.":
    "有 1 天无法计算。",
  "1 interval is left out of PnL and return: its deposits and withdrawals could not be read.":
    "有 1 个区间未计入盈亏和收益：无法读取其充值和提现。",
  "1 market":
    "1 个市场",
  "1 open position":
    "1 个未平仓头寸",
  "1Y":
    "1年",
  "24h %":
    "24小时 %",
  "30d":
    "30天",
  "3M":
    "3个月",
  "7d":
    "7天",
  "Accounts":
    "账户",
  "All chains":
    "所有链",
  "All time: {value}":
    "全部时间：{value}",
  "All time: not enough history yet":
    "全部时间：历史数据还不够",
  "Benchmark: {symbol}":
    "基准：{symbol}",
  "Best day":
    "最佳单日",
  "Chart":
    "图表",
  "Closed (UTC)":
    "平仓时间（UTC）",
  "Could not be read":
    "无法读取",
  "Counterparty":
    "交易对手",
  "Daily closes":
    "每日收盘值",
  "Daily PnL":
    "每日盈亏",
  "Daily PnL (USD)":
    "每日盈亏（USD）",
  "Daily PnL calendar":
    "每日盈亏日历",
  "Day (UTC)":
    "日期（UTC）",
  "Deposits & withdrawals":
    "充值与提现",
  "Deposits fully read":
    "充提已完整读取",
  "deposits unknown here":
    "此处充提未知",
  "Each day's change in equity less the money moved in or out that day. A plain square means the day could not be measured: no close was recorded, or its deposits and withdrawals could not be read.":
    "每天的权益变化减去当天转入或转出的资金。空白方块表示当天无法计算：没有记录收盘值，或无法读取其充值和提现。",
  "Elyra moves money only from your own wallet, and only when you sign. A venue's deposits and withdrawals happen on its own site.":
    "Elyra 只从你自己的钱包转出资金，且只在你签名时进行。交易平台的充值和提现在其自己的网站上完成。",
  "Elyra records your portfolio's close every day from now on, and a reading every five minutes while you have Elyra open. The line starts at the second reading.":
    "从现在起，Elyra 每天记录你投资组合的收盘值，并在你打开 Elyra 时每五分钟读取一次。曲线从第二次读取开始显示。",
  "Entry (USD)":
    "入场价（USD）",
  "Equity (USD)":
    "权益（USD）",
  "Equity includes deposits and withdrawals; Net PnL and Return % take them out.":
    "权益包含充值和提现；净盈亏和收益率 % 已将其扣除。",
  "Equity now":
    "当前权益",
  "Equity on {network}":
    "{network} 上的权益",
  "Exchange":
    "交易所",
  "Fund {venue}":
    "为 {venue} 充值",
  "Gross profit divided by gross loss over the window's closed trades. Above 1 means the winners outweighed the losers.":
    "此时间段内已平仓交易的总盈利除以总亏损。大于 1 表示盈利超过亏损。",
  "Gross profit over gross loss":
    "总盈利与总亏损之比",
  "Hyperliquid perps":
    "Hyperliquid 永续合约",
  "Intervals left out":
    "未计入的区间",
  "Largest fall from a peak in this window":
    "此时间段内从峰值的最大跌幅",
  "Last 90 days, UTC":
    "最近 90 天，UTC",
  "Losing days":
    "亏损天数",
  "Mark (USD)":
    "标记价格（USD）",
  "Max drawdown %":
    "最大回撤 %",
  "Move funds between your accounts":
    "在你的账户之间转移资金",
  "Net deposits (USD)":
    "净充值（USD）",
  "Net of deposits and withdrawals":
    "已扣除充值和提现",
  "Net PnL":
    "净盈亏",
  "Net PnL (USD)":
    "净盈亏（USD）",
  "No change reported.":
    "未报告变化。",
  "No closed trades in this window":
    "此时间段内没有已平仓交易",
  "No losing trades in this window":
    "此时间段内没有亏损交易",
  "Not enough readings in this window yet. Try a longer one.":
    "此时间段内的读数还不够。请选择更长的时间段。",
  "Not read yet.":
    "尚未读取。",
  "One token for another on Solana, signed by you.":
    "在 Solana 上把一种代币换成另一种，由你签名。",
  "Partial: a source could not be read, so this is what could be.":
    "部分数据：有一个来源无法读取，这里显示的是能读取到的部分。",
  "Performance":
    "表现",
  "Performance window":
    "表现时间段",
  "PnL (USD)":
    "盈亏（USD）",
  "Polymarket":
    "Polymarket",
  "Price (USD)":
    "价格（USD）",
  "Profitable days":
    "盈利天数",
  "Reading your daily PnL":
    "正在读取你的每日盈亏",
  "Reading your performance":
    "正在读取你的表现",
  "Reference":
    "交易标识",
  "Return %":
    "收益率 %",
  "Sending on {network} needs Elyra's own EVM wallet.":
    "在 {network} 上发送需要 Elyra 自己的 EVM 钱包。",
  "Sends, receives, swaps and bridges across your wallets, newest first.":
    "你所有钱包中的转出、转入、兑换和跨链记录，最新的在前。",
  "Spot & DeFi":
    "现货与 DeFi",
  "Summary":
    "摘要",
  "Swap inside your wallet":
    "在钱包内兑换",
  "The largest peak-to-trough fall of the time-weighted return in this window, so a withdrawal is never counted as a fall.":
    "此时间段内时间加权收益从峰值到谷底的最大跌幅，因此提现不会被算作下跌。",
  "This account has no wallet yet.":
    "此账户还没有钱包。",
  "Time (UTC)":
    "时间（UTC）",
  "Time-weighted return across every account in this window, net of deposits and withdrawals. All time runs from Elyra's first recorded close.":
    "此时间段内所有账户的时间加权收益，已扣除充值和提现。全部时间从 Elyra 记录的第一个收盘值算起。",
  "Total return":
    "总收益",
  "Total return %":
    "总收益率 %",
  "Transaction history":
    "交易历史",
  "Transactions":
    "交易记录",
  "Unrealised PnL (USD)":
    "未实现盈亏（USD）",
  "Value (USD)":
    "价值（USD）",
  "Wallet on {network}":
    "{network} 上的钱包",
  "What happened":
    "发生了什么",
  "Win rate %":
    "胜率 %",
  "Winning trades over all closed trades: Hyperliquid closing fills, net of fees, and settled Polymarket positions. Paper trades are not counted.":
    "盈利交易占全部已平仓交易的比例：Hyperliquid 平仓成交（扣除手续费）和已结算的 Polymarket 头寸。模拟交易不计入。",
  "Worst day":
    "最差单日",
  "Yes":
    "是",
};
