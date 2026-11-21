import type { Messages } from "../../translate";

/* Simplified Chinese — components/wallet. */

export const wallet: Messages = {
  " — {unpriced} unpriced":
    "——{unpriced} 项未定价",
  " — {unpriced} with no price":
    "——{unpriced} 项没有价格",
  " — {unverified} unverified":
    "——{unverified} 项未验证",
  "(Solscan, opens in a new tab)":
    "（Solscan，在新标签页中打开）",
  "{amount} {symbol} ({slippage}% slippage)":
    "{amount} {symbol}（{slippage}% 滑点）",
  "{buySymbol} at {buyAddress} is not on Elyra’s verified list. It will show in your wallet unverified, and is never valued or counted.":
    "位于 {buyAddress} 的 {buySymbol} 不在 Elyra 的验证列表中。它会以未验证状态显示在你的钱包中，从不估值或计入。",
  "{buySymbol} is not on Elyra’s verified list. It will be shown in your wallet but never counted.":
    "{buySymbol} 不在 Elyra 的验证列表中。它会显示在你的钱包中，但从不计入。",
  "{chain}, by genesis hash":
    "{chain}，按创世哈希",
  "{excluded} holding not in the total":
    "{excluded} 项持仓未计入总额",
  "{excluded} holdings not in the total":
    "{excluded} 项持仓未计入总额",
  "{fee}, taken from the swap":
    "{fee}，从兑换中扣除",
  "{latencyMs} ms":
    "{latencyMs} 毫秒",
  "{name} · {shares} shares per token":
    "{name} · 每个代币对应 {shares} 股",
  "{name} could not be read.":
    "无法读取 {name}。",
  "{route} via LI.FI":
    "{route}，经由 LI.FI",
  "{symbol} is not on Elyra’s verified list. Check the coin before sending it.":
    "{symbol} 不在 Elyra 的验证列表中。发送前请核查该代币。",
  "{symbol} is not on Elyra’s verified list. Check the token before sending it.":
    "{symbol} 不在 Elyra 的验证列表中。发送前请核查该代币。",
  "{unverified} unverified":
    "{unverified} 项未验证",
  "0x… (64 hex characters)":
    "0x…（64 个十六进制字符）",
  "0x…::module::NAME":
    "0x…::module::NAME",
  "Addresses, balances, assets and actions for your wallets on Solana, the EVM networks and Sui.":
    "你在 Solana、EVM 网络和 Sui 上的钱包的地址、余额、资产和操作。",
  "Amount to sell":
    "卖出数量",
  "Approval confirmed. Step 2 of 2 — the swap.":
    "授权已确认。第 2 步，共 2 步——兑换。",
  "Approve":
    "批准",
  "At least":
    "至少",
  "Available in this wallet.":
    "此钱包中的可用余额。",
  "Balance {held} {from} on Sui":
    "Sui 上的余额 {held} {from}",
  "Balance {held} {fromLabel} on {network}":
    "{network} 上的余额 {held} {fromLabel}",
  "Balance {quantity} {label} on {network}":
    "{network} 上的余额 {quantity} {label}",
  "Balance {quantity} {label} on Sui":
    "Sui 上的余额 {quantity} {label}",
  "Check the address and the network. A send cannot be reversed, and funds sent on {network} arrive only on {network2}.":
    "请核对地址和网络。发送无法撤销，在 {network} 上发送的资金只会到达 {network2}。",
  "Check the address. A send cannot be reversed, and funds sent on Sui arrive only on Sui.":
    "请核对地址。发送无法撤销，在 Sui 上发送的资金只会到达 Sui。",
  "Choose two different tokens.":
    "请选择两种不同的代币。",
  "Close wallet":
    "关闭钱包",
  "Coin to buy":
    "买入的代币",
  "Coin to sell":
    "卖出的代币",
  "Coin to send":
    "发送的代币",
  "Coin type to buy":
    "买入的代币类型",
  "Confirm send":
    "确认发送",
  "Contract of the token to buy":
    "买入代币的合约",
  "Disconnecting failed. Try again.":
    "断开失败，请重试。",
  "Ethereum blocks come every twelve seconds and a busy network can take longer. Keep this open until it resolves.":
    "Ethereum 每十二秒出一个区块，网络繁忙时可能更久。请保持此窗口打开，直到有结果。",
  "EVM networks":
    "EVM 网络",
  "Excludes {count} holdings with no price or an unverified mint.":
    "不含 {count} 项没有价格或铸币地址未验证的持仓。",
  "Excludes 1 holding with no price or an unverified mint.":
    "不含 1 项没有价格或铸币地址未验证的持仓。",
  "Export wallet":
    "导出钱包",
  "Fund wallet":
    "为钱包充值",
  "holding":
    "项持仓",
  "holdings":
    "项持仓",
  "I have checked this coin type. Anyone can create a coin under any name; Elyra has not verified this one and will not count it.":
    "我已核查此代币类型。任何人都可以用任意名称创建代币；Elyra 尚未验证此代币，不会将其计入。",
  "I have checked this token’s contract on {name}. Anyone can deploy a token under any name; Elyra has not verified this one and will not value or count it.":
    "我已在 {name} 上核查了此代币的合约。任何人都可以用任意名称部署代币；Elyra 尚未验证此代币，不会对其估值或计入总额。",
  "Last good read":
    "上次成功读取",
  "Last good reading — the latest refresh failed.":
    "上次成功读取——最近一次刷新失败。",
  "Last good reading, {age} — the latest refresh failed.":
    "上次成功读取于 {age}——最近一次刷新失败。",
  "Last read":
    "上次读取",
  "Network fee: up to {networkFeeMax} {gas}, paid on {network}.":
    "网络费：最高 {networkFeeMax} {gas}，在 {network} 上支付。",
  "Network fee: up to {networkFeeMax} SUI.":
    "网络费：最高 {networkFeeMax} SUI。",
  "Network fee: up to {networkFeeMax} SUI. The swap was simulated and delivers at least the minimum above.":
    "网络费：最高 {networkFeeMax} SUI。兑换已经过模拟，至少能收到上方的最低数量。",
  "No balances on {name} yet.":
    "{name} 上还没有余额。",
  "No balances on Sui yet.":
    "Sui 上还没有余额。",
  "No other token balances yet.":
    "还没有其他代币余额。",
  "No price for this coin from Pyth right now.":
    "Pyth 目前没有此代币的价格。",
  "No price for this token from Jupiter.":
    "Jupiter 没有此代币的价格。",
  "No price for this token from Pyth right now.":
    "Pyth 目前没有此代币的价格。",
  "No SOL price from Pyth right now.":
    "Pyth 目前没有 SOL 价格。",
  "No SOL price right now, so the total can't be valued. The balances below are current.":
    "目前没有 SOL 价格，无法计算总值。下方余额是最新的。",
  "No US equity price for {ticker} from Pyth, so this token is not counted.":
    "Pyth 没有 {ticker} 的美股价格，因此该代币不计入。",
  "Nothing has vouched for this token. Check the contract before sending it.":
    "没有任何来源为此代币背书。发送前请核查合约。",
  "Nothing in this wallet yet.":
    "此钱包还没有资产。",
  "One address on {EVM_NETWORKS_LABEL}; each network keeps its own balance.":
    "{EVM_NETWORKS_LABEL} 共用一个地址；每个网络的余额是独立的。",
  "Opening export…":
    "正在打开导出…",
  "Other coin…":
    "其他代币…",
  "Pricing & sync details":
    "定价与同步详情",
  "Pricing and sync details":
    "定价与同步详情",
  "Privy couldn't open the export window. Try again.":
    "Privy 无法打开导出窗口，请重试。",
  "Pyth — unavailable right now":
    "Pyth——目前不可用",
  "Quoted by LI.FI, which charges its own fee; the quote shows it.":
    "由 LI.FI 报价，它会收取自己的费用；报价中会显示。",
  "Quoted by LI.FI, which charges its own fee; the quote shows it. Robinhood Stock Tokens are not swappable in Elyra — they are securities with sale restrictions Elyra cannot check.":
    "由 LI.FI 报价，它会收取自己的费用；报价中会显示。Robinhood 股票代币无法在 Elyra 中兑换——它们是带有出售限制的证券，Elyra 无法核查资格。",
  "Read at slot":
    "读取所在区块槽",
  "Reading Sui":
    "正在读取 Sui",
  "Reading the EVM networks":
    "正在读取 EVM 网络",
  "Reading the wallet…":
    "正在读取钱包…",
  "Reading this account…":
    "正在读取此账户…",
  "Reading this wallet…":
    "正在读取此钱包…",
  "Restoring your session":
    "正在恢复你的会话",
  "Route":
    "路由",
  "Route fee":
    "路由费",
  "RPC round trip":
    "RPC 往返时间",
  "Send {gas} or a token from your EVM wallet on {network}.":
    "从你在 {network} 上的 EVM 钱包发送 {gas} 或代币。",
  "Send on {name}":
    "在 {name} 上发送",
  "Send on {network}":
    "在 {network} 上发送",
  "Send on Sui":
    "在 Sui 上发送",
  "Send SUI or a coin from your Sui wallet.":
    "从你的 Sui 钱包发送 SUI 或代币。",
  "Sent {amount} {symbol} on {network}.":
    "已在 {network} 上发送 {amount} {symbol}。",
  "Set up a Sui wallet":
    "创建 Sui 钱包",
  "Show QR code to receive":
    "显示收款二维码",
  "Show QR code to receive on an EVM network":
    "显示在 EVM 网络上收款的二维码",
  "Show QR code to receive on Sui":
    "显示在 Sui 上收款的二维码",
  "Showing the {count} largest of {tokenCount} tokens. The total includes them all.":
    "显示 {tokenCount} 个代币中最大的 {count} 个。总额包含全部代币。",
  "shown but never valued.":
    "会显示，但从不估值。",
  "Sign in to see your wallet, its balance and what it holds.":
    "登录后即可查看你的钱包、余额和持有的资产。",
  "Signs you out of Elyra. Nothing is deleted.":
    "退出 Elyra 登录。不会删除任何内容。",
  "slot {slot}":
    "区块槽 {slot}",
  "Solana balance":
    "Solana 余额",
  "Step 1 of 2 — {summary}.":
    "第 1 步，共 2 步——{summary}。",
  "Sui could not be read.":
    "无法读取 Sui。",
  "Swap between {gas}, listed tokens and any token by contract on {network}.":
    "在 {network} 上兑换 {gas}、已上架代币和任何按合约地址指定的代币。",
  "Swap between SUI and any coin on Sui.":
    "在 Sui 上兑换 SUI 和任何代币。",
  "Swap on {name}":
    "在 {name} 上兑换",
  "Swap on {network}":
    "在 {network} 上兑换",
  "Swap on Sui":
    "在 Sui 上兑换",
  "Swapped {sellAmount} {sellSymbol} for {buySymbol} on {network}.":
    "已在 {network} 上将 {sellAmount} {sellSymbol} 兑换为 {buySymbol}。",
  "That does not look like a Sui address (0x followed by 64 hex characters).":
    "这看起来不像 Sui 地址（0x 后跟 64 个十六进制字符）。",
  "That does not look like an EVM address (0x followed by 40 hex characters).":
    "这看起来不像 EVM 地址（0x 后跟 40 个十六进制字符）。",
  "That is not a contract address (0x followed by 40 hex characters).":
    "这不是合约地址（0x 后跟 40 个十六进制字符）。",
  "That is not a Sui coin type (0x…::module::NAME).":
    "这不是 Sui 代币类型（0x…::module::NAME）。",
  "That send could not be prepared.":
    "无法准备这笔发送。",
  "That swap could not be quoted.":
    "无法为这笔兑换报价。",
  "The approval landed, but a fresh quote could not be fetched. Review again to continue.":
    "授权已上链，但无法获取新报价。请重新审核以继续。",
  "The latest refresh failed; these are the last good balances.":
    "最近一次刷新失败；这些是上次成功读取的余额。",
  "The latest refresh failed: {error}":
    "最近一次刷新失败：{error}",
  "The Sui wallet could not be created.":
    "无法创建 Sui 钱包。",
  "The swap router needs permission to move exactly {sellAmount} {sellSymbol}. Once that confirms, Elyra fetches a fresh quote for the swap itself, which you sign separately.":
    "兑换路由需要获得恰好转移 {sellAmount} {sellSymbol} 的权限。确认后，Elyra 会为兑换本身获取新报价，由你单独签名。",
  "These are {value} balances, not {value2} ones. A Solana key is valid on every cluster, so the endpoint decides which ledger is read — point SOLANA_RPC_URL at mainnet.":
    "这些是 {value} 的余额，而不是 {value2} 的。Solana 密钥在所有集群上都有效，因此由端点决定读取哪个账本——请将 SOLANA_RPC_URL 指向主网。",
  "These balances couldn't be read.":
    "无法读取这些余额。",
  "This account has no Sui wallet yet.":
    "此账户还没有 Sui 钱包。",
  "This account has no Sui wallet yet. Open the wallet to set one up.":
    "此账户还没有 Sui 钱包。打开钱包即可创建。",
  "This address is a contract, not a personal wallet. Send only if it is set up to receive {symbol} on {network} — an exchange deposit or a multisig, say.":
    "这个地址是合约，不是个人钱包。只有在它被设置为可在 {network} 上接收 {symbol} 时才发送——比如交易所充值地址或多签钱包。",
  "This EVM wallet is a linked external wallet, so sending and swapping happen in that wallet’s own app.":
    "此 EVM 钱包是关联的外部钱包，因此发送和兑换需要在该钱包自己的应用中进行。",
  "This key is held by {holder} — export it from there.":
    "此私钥由 {holder} 持有——请从那里导出。",
  "This server has no Solana RPC configured (SOLANA_RPC_URL), so balances can't be read.":
    "此服务器未配置 Solana RPC（SOLANA_RPC_URL），因此无法读取余额。",
  "This wallet's key isn't held by Elyra, so it is exported from the app that holds it.":
    "此钱包的私钥不由 Elyra 持有，因此需要从持有它的应用中导出。",
  "Token contract, 0x…":
    "代币合约，0x…",
  "token is":
    "个代币",
  "Token prices and names":
    "代币价格和名称",
  "Token to buy":
    "买入的代币",
  "tokens are":
    "个代币",
  "Trying…":
    "正在尝试…",
  "Unverified coins are never valued.":
    "未验证代币从不估值。",
  "Unverified token":
    "未验证代币",
  "Unverified token. Shown because it is in the wallet; not counted in the total, because anyone can create a token under a name that is already taken.":
    "未验证代币。因为它在钱包里所以显示；不计入总额，因为任何人都可以用已被占用的名称创建代币。",
  "Unverified tokens are never valued.":
    "未验证代币从不估值。",
  "Unverified, held":
    "未验证，持有",
  "View on {name} (opens in a new tab)":
    "在 {name} 上查看（在新标签页中打开）",
  "View on Solscan (opens in a new tab)":
    "在 Solscan 上查看（在新标签页中打开）",
  "View on Suiscan (opens in a new tab)":
    "在 Suiscan 上查看（在新标签页中打开）",
  "Wallet actions":
    "钱包操作",
  "Wallet identity":
    "钱包身份",
  "You receive":
    "你收到",
  "You sell":
    "你卖出",
  "Your EVM wallet on this account is a linked external wallet. Elyra signs only with its own embedded wallet, so send or swap on {name} from that wallet’s own app.":
    "此账户的 EVM 钱包是关联的外部钱包。Elyra 只用自己的内置钱包签名，因此请在该钱包自己的应用中在 {name} 上发送或兑换。",
};
