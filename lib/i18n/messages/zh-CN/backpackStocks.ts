import type { Messages } from "../../translate";

/* Simplified Chinese — Backpack Securities' tokenized stocks listed from
   Jupiter's index, on a deployment without Sunrise's key
   (components/equities, app/api/swap/tokens, lib/equities/server.ts). */

export const backpackStocks: Messages = {
  "A tokenized stock is not the share: it gives no ownership in the company, and its issuer gives no guarantee of a market or of redemption. These tokens are not offered to US persons; Elyra does not offer Backpack Securities' tokens to PRC residents either. The premium compares one token with one share, before any multiplier an issuer applies for dividends or corporate actions.":
    "代币化股票并非股票本身：它不代表对公司的任何所有权，发行方也不保证存在交易市场或可以赎回。这些代币不向美国人士提供；Elyra 同样不向中国居民提供 Backpack Securities 的代币。溢价按一个代币对比一股计算，未计入发行方因分红或公司行动而应用的任何乘数。",
  "Backpack Securities":
    "Backpack Securities",
  "Backpack Securities' listing could not be read from Jupiter just now.":
    "暂时无法从 Jupiter 读取 Backpack Securities 的上架列表。",
  "Issued through Backpack's tokenization service and Trek Nexus Markets' trust, listed here from Jupiter's token index and held to the issuer's freeze authority on Solana. Shares are converted to tokens and back on Backpack Exchange, with a Backpack account and its eligibility checks.":
    "通过 Backpack 的代币化服务和 Trek Nexus Markets 的信托发行，此处的列表来自 Jupiter 的代币索引，并在 Solana 上核对发行方的冻结权限。股票与代币之间的相互转换在 Backpack Exchange 上进行，需要 Backpack 账户并通过其资格审核。",
  "Swapped in your wallet through Jupiter, once you confirm you are eligible.":
    "在你确认符合资格后，通过 Jupiter 在你的钱包中兑换。",
  "Tokenized stocks (Backpack)":
    "代币化股票（Backpack）",
};
