import type { Messages } from "../../translate";

/* Simplified Chinese — components/invest. */

export const invest: Messages = {
  " · out of band":
    " · 超出区间",
  " The rest can be retried — prices are quoted fresh each time.":
    " 其余可以重试——每次都会重新报价。",
  "— out of band":
    "——超出区间",
  "· {value}% of holdings":
    "· 持仓的 {value}%",
  "{count} holdings · {tickers}":
    "{count} 项持仓 · {tickers}",
  "{count} holdings · {tickers} and {more} more":
    "{count} 项持仓 · {tickers} 等另外 {more} 项",
  "{count} holdings are new to this wallet. Each opens a token account that holds about 0.002 SOL, returned if the account is closed — keep some SOL for that and for network fees.":
    "有 {count} 项持仓是此钱包中新增的。每项都会开设一个代币账户，占用约 0.002 SOL，账户关闭时退还——请为此和网络费预留一些 SOL。",
  "{count} swaps, each signed in your wallet, run one after another. If one is refused — an Ondo token outside its trading hours — the rest still run, and you can retry it.":
    "{count} 笔兑换，每笔都在你的钱包中签名，依次执行。如果其中一笔被拒绝——比如 Ondo 代币在交易时间之外——其余仍会执行，你可以重试被拒绝的那笔。",
  "{landed} of {count} swaps landed.":
    "{count} 笔兑换中已上链 {landed} 笔。",
  "{landed} of 1 swap landed.":
    "1 笔兑换中已上链 {landed} 笔。",
  "{name}: each holding's target weight, price and, if you hold it, its share of your position.":
    "{name}：每项持仓的目标权重、价格，以及如果你持有，它在你头寸中的占比。",
  "{tickers} are outside their bands.":
    "{tickers} 超出了各自的区间。",
  "{tickers} is outside its band.":
    "{tickers} 超出了其区间。",
  "{title}: a list of swaps, each routed by Jupiter and signed in your wallet.":
    "{title}：一组兑换，每笔都由 Jupiter 路由并在你的钱包中签名。",
  "1 holding is new to this wallet. It opens a token account that holds about 0.002 SOL, returned if the account is closed — keep some SOL for that and for network fees.":
    "有 1 项持仓是此钱包中新增的。它会开设一个代币账户，占用约 0.002 SOL，账户关闭时退还——请为此和网络费预留一些 SOL。",
  "1 swap, signed in your wallet. If it is refused — an Ondo token outside its trading hours — you can retry it.":
    "1 笔兑换，在你的钱包中签名。如果被拒绝——比如 Ondo 代币在交易时间之外——你可以重试。",
  "A holding in this portfolio has no price right now.":
    "该投资组合中有一项持仓目前没有价格。",
  "A holding is out of band when it is more than {points} percentage points from its target, or more than {relative}% of its target away — whichever is tighter. A 40% holding may sit between 35% and 45%; a 4% one between 3% and 5%.":
    "当持仓偏离目标超过 {points} 个百分点，或超过目标的 {relative}%（以较严格者为准）时，即视为超出区间。40% 的持仓可在 35% 至 45% 之间；4% 的持仓可在 3% 至 5% 之间。",
  "Add USDC":
    "追加 USDC",
  "All portfolios":
    "所有投资组合",
  "Amount in USDC":
    "USDC 金额",
  "Buy {name}":
    "买入 {name}",
  "Buy {ticker} with {amount} USDC":
    "用 {amount} USDC 买入 {ticker}",
  "Buy portfolio":
    "买入投资组合",
  "Connect a Solana wallet to buy this portfolio.":
    "连接 Solana 钱包以买入这个投资组合。",
  "Did not go through":
    "未成功",
  "Drifted":
    "已偏离",
  "Every holding is within its band.":
    "所有持仓都在区间内。",
  "Explorer":
    "浏览器",
  "From ${portfolio}":
    "起投 ${portfolio}",
  "From ${portfolio}. Split by target weight, one swap per holding.":
    "起投 ${portfolio}。按目标权重拆分，每项持仓一笔兑换。",
  "Holding":
    "持仓",
  "How these work":
    "运作方式",
  "it back to target.":
    "调回目标。",
  "Its prices are unavailable right now. It will try again shortly.":
    "其价格目前不可用，稍后会自动重试。",
  "Landed":
    "已上链",
  "Landed and recorded":
    "已上链并记录",
  "Landed, but not counted in this portfolio: {reason}":
    "已上链，但未计入这个投资组合：{reason}",
  "Landed, but the network has not shown it yet, so it is not counted in this portfolio. Record it again in a minute.":
    "已上链，但网络尚未显示，因此暂未计入这个投资组合。一分钟后再记录一次。",
  "No 24-hour change reported.":
    "未报告 24 小时变化。",
  "No buys":
    "无买入",
  "No price right now":
    "目前没有价格",
  "No price right now for {value}.":
    "{value} 目前没有价格。",
  "None of this portfolio's holdings report a 24-hour change right now.":
    "该投资组合的持仓目前都没有 24 小时变化数据。",
  "Not started":
    "未开始",
  "Not started — the signature before it was cancelled.":
    "未开始——前一笔签名已被取消。",
  "Nothing to rebalance — every difference is under a swap's minimum.":
    "无需再平衡——每项差额都低于一笔兑换的最低限额。",
  "On target":
    "符合目标",
  "Portfolios":
    "投资组合",
  "Portfolios are unavailable":
    "投资组合暂不可用",
  "Rebalance":
    "再平衡",
  "Rebalance {name}":
    "再平衡 {name}",
  "Rebalancing waits for your wallet balances to load.":
    "再平衡需要等待你的钱包余额加载完成。",
  "Record again":
    "重新记录",
  "Recording…":
    "正在记录…",
  "Retry {count} swaps":
    "重试 {count} 笔兑换",
  "Retry 1 swap":
    "重试 1 笔兑换",
  "Review rebalance":
    "审核再平衡",
  "Sales run first, so the buys are paid with the USDC they raise. Buys spend 99% of the expected proceeds, so a little USDC may be left.":
    "先执行卖出，用其换得的 USDC 支付买入。买入只花费预期所得的 99%，因此可能会剩下少量 USDC。",
  "Sell {amount} {ticker} for USDC":
    "卖出 {amount} {ticker} 换成 USDC",
  "Sells about {raise} ·":
    "卖出约 {raise} ·",
  "Sign in to buy this portfolio into your own wallet.":
    "登录后即可把这个投资组合买入你自己的钱包。",
  "Some prices are missing":
    "部分价格缺失",
  "Spends {spend} USDC":
    "花费 {spend} USDC",
  "Start purchase":
    "开始买入",
  "Start rebalance":
    "开始再平衡",
  "Still not recorded.":
    "仍未记录。",
  "Stop after this swap":
    "这笔兑换后停止",
  "Stopped before this swap.":
    "在这笔兑换之前已停止。",
  "Target":
    "目标",
  "The catalog could not be read. It will try again shortly.":
    "无法读取目录，稍后会自动重试。",
  "the ledger refused it.":
    "账本拒绝了它。",
  "This portfolio could not be read":
    "无法读取该投资组合",
  "This wallet holds {value} USDC. Swap or deposit more first.":
    "此钱包持有 {value} USDC。请先兑换或充值更多。",
  "trade brings":
    "笔交易可将其",
  "trades bring":
    "笔交易可将其",
  "Waiting for your signature":
    "等待你的签名",
  "Wallet: {usdc} USDC.":
    "钱包：{usdc} USDC。",
  "Weights set {reviewedOn}":
    "权重设定于 {reviewedOn}",
  "Why these":
    "为什么选这些",
  "Your position":
    "你的头寸",
  "Yours":
    "你的",
  "Yours ·":
    "你的 ·",
};
