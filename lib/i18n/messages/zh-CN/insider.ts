import type { Messages } from "../../translate";

/* Simplified Chinese — insider watch: Research's tab, the bell's notices and their sentences (components/research/InsiderTab.tsx, lib/insider). */

export const insider: Messages = {
  /* The tab */
  "Insider watch":
    "内幕交易监测",
  "New Hyperliquid wallets whose first trade was big: funded, then holding at least {amount} within the hour. Elyra checks Hyperliquid's public records every five minutes.":
    "首笔交易规模很大的 Hyperliquid 新钱包：入金后一小时内持仓至少 {amount}。Elyra 每五分钟检查一次 Hyperliquid 的公开记录。",
  "A pattern, not proof. A fresh wallet with a big first trade can be a trader's new account, a fund, a hedge or luck. Nobody here is accused of anything, and none of this is advice.":
    "这是一种模式，不是证据。首笔交易很大的新钱包可能是交易者的新账户、基金、对冲，或只是运气。这里不指控任何人，也不构成任何建议。",
  "No scan has run yet. The first runs on the next five-minute tick.":
    "尚未运行过扫描。第一次扫描会在下一个五分钟周期运行。",
  "Last checked {when}: {checked} new wallets read, {flagged} flagged.":
    "上次检查于{when}：读取了 {checked} 个新钱包，标记了 {flagged} 个。",
  "Loading insider watch…":
    "正在加载内幕交易监测…",
  "No fresh wallet has matched in the last 30 days":
    "过去 30 天没有符合条件的新钱包",
  "When one does, it appears here first.":
    "一旦出现，会最先显示在这里。",
  "Flagged when the wallet's first activity is at most {hours} hours before its first perp trade and its largest bet in that first hour is at least {amount}. Where the entry sat is read from Hyperliquid's hourly candles for the week before. The move since uses the live price.":
    "标记条件：钱包首次活动距其首笔永续合约交易不超过 {hours} 小时，且其第一个小时内最大的一笔仓位至少为 {amount}。入场价在区间中的位置取自此前一周 Hyperliquid 的小时 K 线。此后的涨跌使用实时价格。",

  /* The watch */
  "Sign in to be told when Elyra flags one.":
    "登录后，Elyra 标记新钱包时会通知你。",
  "Notify me":
    "通知我",
  "Notifications are on":
    "通知已开启",
  "Get a notification under the bell when Elyra flags a fresh wallet whose first bet is at least:":
    "当 Elyra 标记首笔仓位至少达到以下金额的新钱包时，在铃铛下通知我：",
  "Each new wallet whose first bet is at least {amount} appears under the bell, on this website.":
    "每个首笔仓位至少 {amount} 的新钱包都会显示在本网站的铃铛下。",
  "Smallest first bet":
    "最小首笔仓位",
  "This browser blocks notifications from Elyra. Allow them in its site settings to get desktop notices.":
    "此浏览器屏蔽了 Elyra 的通知。请在网站设置中允许通知，以接收桌面提醒。",
  "Desktop notices are on in this browser while Elyra is open.":
    "Elyra 打开时，此浏览器的桌面提醒已开启。",
  "Turn off desktop notices":
    "关闭桌面提醒",
  "Also show a desktop notice while Elyra is open in this browser.":
    "Elyra 在此浏览器中打开时，也显示桌面提醒。",
  "Turn on desktop notices":
    "开启桌面提醒",
  "Fresh wallet, big first trade":
    "新钱包，大额首笔交易",

  /* A wallet */
  "First trade {when}":
    "首笔交易于{when}",
  "Average entry {price} over {fills} fills.":
    "平均入场价 {price}，共 {fills} 笔成交。",
  "Copy the wallet's address":
    "复制钱包地址",
  "Open on Hyperliquid":
    "在 Hyperliquid 上打开",
  "Found {hours} hours after its first trade, so it was listed without a notification.":
    "在首笔交易 {hours} 小时后才发现，因此只列出、未发送通知。",
  "Positions now":
    "当前持仓",
  "Reading Hyperliquid…":
    "正在读取 Hyperliquid…",
  "Account value now: {value}.":
    "当前账户价值：{value}。",
  "No open positions now.":
    "当前没有持仓。",
  "Long {size} {market}":
    "做多 {size} {market}",
  "Short {size} {market}":
    "做空 {size} {market}",
  "entry {price}":
    "入场价 {price}",
  "worth {value}":
    "价值 {value}",
  "{pnl} unrealised":
    "未实现盈亏 {pnl}",
  "liquidation at {price}":
    "强平价 {price}",

  /* The sentences (lib/insider/words.ts) */
  "Went long {amount} of {market}":
    "做多 {amount} 的 {market}",
  "Went short {amount} of {market}":
    "做空 {amount} 的 {market}",
  "long {amount} of {market}":
    "做多 {amount} 的 {market}",
  "short {amount} of {market}":
    "做空 {amount} 的 {market}",
  "First trade 1 second after the wallet was funded.":
    "钱包入金 1 秒后进行了首笔交易。",
  "First trade {n} seconds after the wallet was funded.":
    "钱包入金 {n} 秒后进行了首笔交易。",
  "First trade {n} minutes after the wallet was funded.":
    "钱包入金 {n} 分钟后进行了首笔交易。",
  "First trade {n} hours after the wallet was funded.":
    "钱包入金 {n} 小时后进行了首笔交易。",
  "Funded through Hyperliquid's bridge.":
    "通过 Hyperliquid 的跨链桥入金。",
  "{amount} came in through Hyperliquid's bridge before the bet.":
    "下注前通过 Hyperliquid 的跨链桥转入了 {amount}。",
  "Funded by a transfer from another Hyperliquid account, {from}.":
    "资金来自另一个 Hyperliquid 账户 {from} 的转账。",
  "{amount} was sent in before the bet, first from another Hyperliquid account, {from}.":
    "下注前共转入 {amount}，第一笔来自另一个 Hyperliquid 账户 {from}。",
  "The bet was {x}× the money sent in.":
    "这笔仓位是转入资金的 {x} 倍。",
  "Bought below the low of the previous {days} days.":
    "买入价低于此前 {days} 天的最低点。",
  "Sold above the high of the previous {days} days.":
    "卖出价高于此前 {days} 天的最高点。",
  "Bought within the lowest {pct}% of the previous {days} days' range.":
    "买入价处于此前 {days} 天区间的最低 {pct}% 之内。",
  "Sold within the highest {pct}% of the previous {days} days' range.":
    "卖出价处于此前 {days} 天区间的最高 {pct}% 之内。",
  "Entry {pct}% of the way up the previous {days} days' range.":
    "入场价位于此前 {days} 天区间自低点起 {pct}% 的位置。",
  "Nothing else was opened in its first hour.":
    "第一个小时内没有开其他仓位。",
  "Also in its first hour: {bets}.":
    "第一个小时内还开了：{bets}。",
  "{market} has risen {pct}% since this long was opened.":
    "自开出这笔多单以来，{market} 上涨了 {pct}%。",
  "{market} has fallen {pct}% since this long was opened.":
    "自开出这笔多单以来，{market} 下跌了 {pct}%。",
  "{market} has risen {pct}% since this short was opened.":
    "自开出这笔空单以来，{market} 上涨了 {pct}%。",
  "{market} has fallen {pct}% since this short was opened.":
    "自开出这笔空单以来，{market} 下跌了 {pct}%。",

  /* What the server and the store may say */
  "Insider watch needs database migration 0031, which has not been applied.":
    "内幕交易监测需要数据库迁移 0031，但尚未应用。",
  "Insider watch could not read its records.":
    "内幕交易监测无法读取其记录。",
  "Insider watch could not be read.":
    "无法读取内幕交易监测。",
  "Insider watch is unavailable.":
    "内幕交易监测暂不可用。",
  "Elyra has not flagged that wallet.":
    "Elyra 没有标记该钱包。",
  "The watch could not be saved.":
    "无法保存监测设置。",
  "The watch could not be turned off.":
    "无法关闭监测。",
  "Choose one of the listed sizes.":
    "请选择列出的金额之一。",
  "Sign in to set a watch.":
    "登录后才能设置监测。",
  "Sign in first.":
    "请先登录。",
  "Hyperliquid did not answer. Try again.":
    "Hyperliquid 没有响应，请重试。",
  "Too many reads just now. Try again in a minute.":
    "刚才读取次数过多，请一分钟后重试。",
  "That is not a Hyperliquid address.":
    "这不是 Hyperliquid 地址。",
};
