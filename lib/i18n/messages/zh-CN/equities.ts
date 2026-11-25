import type { Messages } from "../../translate";

/* Simplified Chinese — tokenized stocks: app/stocks, components/equities, and the swap dialog's Sunrise text. */

export const equities: Messages = {
  "Tokenized stocks":
    "代币化股票",
  "Every tokenized stock and ETF on-chain, grouped by share, with where each is minted and where it trades.":
    "链上的每一只代币化股票和 ETF，按对应股票分组，并标明各自在哪里铸造、在哪里交易。",
  "Every issuer, primary and secondary markets":
    "所有发行方，一级与二级市场",
  "Placed. Waiting for a market maker to fill it.":
    "已下单，等待做市商成交。",
  "Filled. The tokens are in your wallet.":
    "已成交，代币已在你的钱包中。",
  "Filled in part. What was not filled went back to your wallet.":
    "部分成交，未成交部分已退回你的钱包。",
  "Cancelled. The funds went back to your wallet.":
    "已取消，资金已退回你的钱包。",
  "Refunded to your wallet.":
    "已退款至你的钱包。",
  "The order failed.":
    "订单失败。",
  "I am not a US person or a resident of mainland China, Hong Kong or Macau, and I am not otherwise restricted from holding these tokens. Tokenized stocks listed by Sunrise are not the shares themselves.":
    "我不是美国人士，也不是中国内地、香港或澳门居民，且不受其他限制而不得持有这些代币。Sunrise 上架的代币化股票并非股票本身。",
  "Order placed.":
    "订单已提交。",
  "Sunrise":
    "Sunrise",
  "xStocks":
    "xStocks",
  "Ondo":
    "Ondo",
  "Robinhood":
    "Robinhood",
  "Issued through Backpack's tokenization service and Trek Nexus Markets' trust, listed on Solana by Sunrise. Shares are converted to tokens and back on Backpack Exchange, with a Backpack account and its eligibility checks.":
    "通过 Backpack 的代币化服务和 Trek Nexus Markets 的信托结构发行，由 Sunrise 在 Solana 上架。股票与代币之间的相互转换在 Backpack Exchange 上进行，需要 Backpack 账户并通过其资格审核。",
  "Backed Finance's xStocks on Solana. Minted and redeemed by Backed for its eligible clients.":
    "Backed Finance 在 Solana 上的 xStocks。由 Backed 为其合格客户铸造和赎回。",
  "Ondo Global Markets' tokens on Solana. Minted and redeemed through Ondo for its eligible clients.":
    "Ondo Global Markets 在 Solana 上的代币。通过 Ondo 为其合格客户铸造和赎回。",
  "Robinhood's stock tokens on Robinhood Chain. Issued and redeemed by Robinhood.":
    "Robinhood 在 Robinhood Chain 上的股票代币。由 Robinhood 发行和赎回。",
  "Swapped in your wallet through Sunrise's routes — Jupiter, Titan, DFlow and its market makers — once you confirm you are eligible.":
    "在你确认符合资格后，通过 Sunrise 的路由（Jupiter、Titan、DFlow 及其做市商）在你的钱包中兑换。",
  "Swapped in your wallet through Jupiter.":
    "通过 Jupiter 在你的钱包中兑换。",
  "Swapped in your wallet through Jupiter, where Ondo's market maker quotes during its trading window.":
    "通过 Jupiter 在你的钱包中兑换，Ondo 的做市商在其交易时段内报价。",
  "Shown, not traded: Robinhood says they may not be sold to US persons, and Elyra cannot check that.":
    "仅展示，不交易：Robinhood 表示这些代币不得出售给美国人士，而 Elyra 无法核实这一点。",
  "Share price · outside regular hours":
    "股价 · 非常规交易时段",
  "Share price":
    "股价",
  "Primary market":
    "一级市场",
  "Solana":
    "Solana",
  "Robinhood Chain":
    "Robinhood Chain",
  "Primary and secondary markets":
    "一级与二级市场",
  "{count} tokens":
    "{count} 个代币",
  "How conversion works":
    "转换流程说明",
  "Secondary market":
    "二级市场",
  "A tokenized stock is not the share: it gives no ownership in the company, and its issuer gives no guarantee of a market or of redemption. These tokens are not offered to US persons; Sunrise's are not offered to PRC residents either. The premium compares one token with one share, before any multiplier an issuer applies for dividends or corporate actions.":
    "代币化股票并非股票本身：它不代表对公司的任何所有权，发行方也不保证存在交易市场或可以赎回。这些代币不向美国人士提供；Sunrise 上架的代币同样不向中国居民提供。溢价按一个代币对比一股计算，未计入发行方因分红或公司行动而应用的任何乘数。",
  "Search a ticker or a company":
    "搜索股票代码或公司",
  "Search tokenized stocks":
    "搜索代币化股票",
  "Issuer":
    "发行方",
  "All issuers":
    "全部发行方",
  "Tokenized stocks could not be read just now.":
    "暂时无法读取代币化股票。",
  "The listings and prices come from each issuer and from Pyth. Try again in a moment.":
    "上架信息和价格来自各发行方和 Pyth。请稍后再试。",
  "Nothing matches that.":
    "没有匹配的结果。",
  "Try a ticker such as TSLA, or a company name.":
    "试试 TSLA 这样的股票代码，或公司名称。",
  "{count} shares, each with its tokens":
    "{count} 只股票，各附其代币",
  "Show more":
    "显示更多",
  /* Notes the catalogue route returns, shown through t(). */
  "Sunrise's listing could not be read just now.":
    "暂时无法读取 Sunrise 的上架列表。",
  "Robinhood's stock-token registry could not be read just now.":
    "暂时无法读取 Robinhood 的股票代币登记表。",
  "On-chain prices could not be read just now.":
    "暂时无法读取链上价格。",
  "Share prices are not available: Pyth is not configured.":
    "股票价格不可用：未配置 Pyth。",
  "Share prices could not be read from Pyth just now.":
    "暂时无法从 Pyth 读取股票价格。",
  "Tokenized stocks (Sunrise)":
    "代币化股票（Sunrise）",
  /* The swap picker's group labels (lib/trade.ts `catalogue`), shown through t(). */
  "Memecoins":
    "迷因币",
  "Stablecoins":
    "稳定币",
  "Yield-bearing dollars":
    "生息美元",
  "Index funds":
    "指数基金",
  "Bond funds":
    "债券基金",
};
