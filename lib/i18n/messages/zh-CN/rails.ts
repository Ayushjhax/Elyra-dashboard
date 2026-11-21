import type { Messages } from "../../translate";

/* Simplified Chinese — components/rails. */

export const rails: Messages = {
  " · not on the OFAC sanctions list":
    " · 不在 OFAC 制裁名单上",
  " · receipt":
    " · 凭证",
  " {count} events; head":
    " {count} 个事件；链头",
  "· lapses in":
    "· 失效于",
  "· used {lastUsedAt}":
    "· 上次使用 {lastUsedAt}",
  "{minutesLeft} min":
    "{minutesLeft} 分钟",
  "{spentTodayUsd} / {dailyUsd} today":
    "今日 {spentTodayUsd} / {dailyUsd}",
  "{spentTodayUsd} of {dailyUsd} used today":
    "今日已用 {spentTodayUsd} / {dailyUsd}",
  "{summary} — done, and recorded in your ledger.":
    "{summary}——已完成，并记录在你的账本中。",
  "1 hour":
    "1 小时",
  "24 hours":
    "24 小时",
  "3 days":
    "3 天",
  "7 days":
    "7 天",
  "a minute":
    "一分钟",
  "A payment cannot be reversed. It goes from your wallet straight to the payee; Elyra never holds it.":
    "付款无法撤销。资金从你的钱包直接转给收款方；Elyra 从不经手。",
  "A USDC request on Solana to your own wallet, with a link and a Solana Pay code anyone can pay from any wallet. Agents with the mandate can make these too. It settles when the chain shows the payment — Elyra never holds the money.":
    "一笔在 Solana 上付到你自己钱包的 USDC 请求，附带链接和 Solana Pay 码，任何人都可以用任何钱包支付。拥有授权书的代理也可以创建这类请求。链上显示付款后即结算——Elyra 从不经手资金。",
  "Agent activity":
    "代理动态",
  "Agent asked":
    "代理发起请求",
  "Agents are unavailable":
    "代理暂不可用",
  "Allow live perp orders":
    "允许实盘永续合约订单",
  "Amount (USDC)":
    "金额（USDC）",
  "Any — or e.g. SOL, USDC, BTC":
    "任意——或例如 SOL、USDC、BTC",
  "Any payee that passes sanctions screening":
    "任何通过制裁筛查的收款方",
  "Approve {mode} order":
    "批准{mode}订单",
  "Approve and sign":
    "批准并签名",
  "Approve order":
    "批准订单",
  "ask to be paid":
    "请求收款",
  "asked by {agent}":
    "由 {agent} 请求",
  "Broken at #{brokenAt}":
    "在 #{brokenAt} 处断裂",
  "Carried out":
    "已执行",
  "Chain intact":
    "链完整",
  "Change mandate":
    "修改授权书",
  "Copy link":
    "复制链接",
  "Copy the pay link for {label}":
    "复制 {label} 的付款链接",
  "Create an agent key":
    "创建代理密钥",
  "Create request":
    "创建请求",
  "Creating":
    "正在创建",
  "Decline":
    "拒绝",
  "ended":
    "已结束",
  "Ends":
    "结束时间",
  "ends in {days} days":
    "{days} 天后结束",
  "ends within a day":
    "一天内结束",
  "Every mandate, every request an agent sent and what became of it, every payment — in order, each event sealed with the SHA-256 of the one before.":
    "每份授权书、代理发送的每个请求及其结果、每笔付款——按顺序排列，每个事件都用前一个事件的 SHA-256 密封。",
  "Expired":
    "已过期",
  "Export CSV":
    "导出 CSV",
  "Get paid":
    "收款",
  "Give AI agents scoped permission to ask for swaps, payments and trades — and approve each one yourself.":
    "授予 AI 代理有范围的权限，让它们发起兑换、付款和交易请求——并由你亲自逐一批准。",
  "Grant a mandate":
    "授予授权书",
  "Grant mandate":
    "授予授权书",
  "In 7 days":
    "7 天后",
  "In 90 days":
    "90 天后",
  "It may ask to":
    "它可以请求",
  "Lapsed":
    "已失效",
  "Ledger":
    "账本",
  "Let perp orders inside these limits run without my review":
    "允许这些限额内的永续合约订单无需我审核即执行",
  "Mandate":
    "授权书",
  "Mandate granted":
    "已授予授权书",
  "Mandate revoked":
    "已撤销授权书",
  "May {kinds} · up to {each} each, {daily} a day":
    "可以{kinds} · 每笔最高 {each}，每天 {daily}",
  "Needs your review":
    "需要你审核",
  "No agents yet. Give an AI agent — Claude, ChatGPT, a bot of your own — an Elyra key in Connections, then grant it a mandate here.":
    "还没有代理。在“连接”中给 AI 代理（Claude、ChatGPT 或你自己的机器人）一个 Elyra 密钥，然后在这里授予它授权书。",
  "Not on the OFAC sanctions list as of {value} UTC. That is all the screen says — check you know who you are paying.":
    "截至 {value} UTC，不在 OFAC 制裁名单上。筛查结果仅此而已——请确认你知道自己在付款给谁。",
  "Nothing is waiting. When an agent asks for something inside its mandate, it appears here and you are notified.":
    "没有待处理的事项。当代理在其授权范围内发起请求时，会显示在这里并通知你。",
  "Nothing yet. Everything an agent asks for — done, declined or refused — is listed here, with why.":
    "还什么都没有。代理请求的每一件事——已完成、已拒绝或被驳回——都会连同原因列在这里。",
  "on Solana":
    "在 Solana 上",
  "On Solscan":
    "在 Solscan 上",
  "Only these assets (optional)":
    "仅限这些资产（可选）",
  "Only these payees (optional, one Solana address a line)":
    "仅限这些收款方（可选，每行一个 Solana 地址）",
  "Open for":
    "有效期",
  "Open in a Solana wallet":
    "在 Solana 钱包中打开",
  "Otherwise they are paper only. Live also needs your trading key approved on Automation.":
    "否则只能模拟。实盘还需要你在“自动化”中批准交易密钥。",
  "Paid":
    "已付款",
  "Paid — settled on-chain.":
    "已付款——已在链上结算。",
  "Paid to this wallet":
    "付款至此钱包",
  "Paid. Proven on-chain and recorded in your agent ledger.":
    "已付款。已在链上证实，并记录在你的代理账本中。",
  "Pay for {agent}":
    "为 {agent} 付款",
  "pay in USDC":
    "以 USDC 付款",
  "Pay page":
    "付款页面",
  "Payment on Solscan":
    "Solscan 上的付款",
  "Payment received":
    "已收到付款",
  "Payment request · via Elyra":
    "付款请求 · 通过 Elyra",
  "Payment request made":
    "已创建付款请求",
  "Per day ($)":
    "每天（$）",
  "Per transaction ($)":
    "每笔交易（$）",
  "perps run without review":
    "永续合约无需审核即执行",
  "Preparing the payment":
    "正在准备付款",
  "Read only":
    "只读",
  "Reading the request…":
    "正在读取请求…",
  "Reads only. No mandate: it cannot ask for any transaction.":
    "只读。无授权书：它无法请求任何交易。",
  "Refused by the mandate":
    "被授权书拒绝",
  "Request cancelled":
    "请求已取消",
  "Request expired":
    "请求已过期",
  "Revoke mandate":
    "撤销授权书",
  "Save mandate":
    "保存授权书",
  "Scan with Phantom, Solflare or any Solana Pay wallet. The page updates when the payment lands.":
    "使用 Phantom、Solflare 或任何支持 Solana Pay 的钱包扫码。付款上链后页面会自动更新。",
  "Sent. Waiting for it to land.":
    "已发送，等待上链。",
  "Shown to the payer":
    "向付款方显示",
  "Sign a USDC payment an agent asked for, from your own wallet.":
    "从你自己的钱包签署一笔代理请求的 USDC 付款。",
  "Sign and pay {value} USDC":
    "签名并支付 {value} USDC",
  "Sign in to manage your agents":
    "登录后管理你的代理",
  "Sign payment":
    "签署付款",
  "Signing":
    "正在签名",
  "Solana Pay code to pay {amount} USDC":
    "支付 {amount} USDC 的 Solana Pay 码",
  "swap on Solana":
    "在 Solana 上兑换",
  "Swaps and payments always come to you to sign in your own wallet. Every payee is screened against the OFAC sanctions list. Saving replaces this agent’s current mandate and is recorded in your ledger.":
    "兑换和付款始终需要你在自己的钱包中签名。每个收款方都会与 OFAC 制裁名单进行筛查。保存会替换该代理当前的授权书，并记录在你的账本中。",
  "The agent says:":
    "代理说：",
  "The ledger could not be exported just now.":
    "暂时无法导出账本。",
  "The money goes straight from your wallet to the one above; Elyra never holds it. Only pay requests you expect — anyone can make one.":
    "资金直接从你的钱包转到上方的钱包；Elyra 从不经手。只支付你预期的请求——任何人都可以创建付款请求。",
  "The network did not answer. Retrying.":
    "网络没有响应，正在重试。",
  "The payment could not be prepared.":
    "无法准备这笔付款。",
  "The payment could not be signed.":
    "无法签署这笔付款。",
  "The payment did not land.":
    "付款未上链。",
  "The payment has not landed yet. Check the explorer before trying again.":
    "付款尚未上链。重试前请先在浏览器中核查。",
  "The payment landed but could not be recorded against the request.":
    "付款已上链，但无法记录到对应请求。",
  "The payment landed. Elyra could not record it yet; it will show as paid once the network catches up.":
    "付款已上链。Elyra 暂时无法记录；网络同步后会显示为已付款。",
  "The payment on Solscan":
    "在 Solscan 上查看这笔付款",
  "The payment was not accepted by the network.":
    "网络未接受这笔付款。",
  "The swap landed but could not be recorded.":
    "兑换已上链，但无法记录。",
  "The swap landed; it will show as done once the network catches up.":
    "兑换已上链；网络同步后会显示为已完成。",
  "This account has no Solana wallet to sign with.":
    "此账户没有可用于签名的 Solana 钱包。",
  "This account's Solana wallet is not connected in this browser.":
    "此账户的 Solana 钱包未在此浏览器中连接。",
  "This payment request could not be read.":
    "无法读取这笔付款请求。",
  "This payment was built for a different wallet than the one signed in here.":
    "这笔付款是为另一个钱包构建的，而不是此处登录的钱包。",
  "This request has expired.":
    "这笔请求已过期。",
  "This request was cancelled.":
    "这笔请求已取消。",
  "Through your Hyperliquid trading key, which can trade and cannot withdraw.":
    "通过你的 Hyperliquid 交易密钥，它可以交易但无法提现。",
  "trade Hyperliquid perps":
    "交易 Hyperliquid 永续合约",
  "View on Solscan":
    "在 Solscan 上查看",
  "Waiting for you":
    "等待你处理",
  "What it is for":
    "用途",
  "When I revoke it":
    "直到我撤销",
  "You approved":
    "你已批准",
  "You declined":
    "你已拒绝",
  "You pay":
    "你支付",
  "Your agents":
    "你的代理",
  "Your agents ask; you decide. Each holds an Elyra key, never a wallet key. A mandate sets what it may ask for and how much; every ask is held to it, and nothing moves without your signature — except perp orders you let run.":
    "你的代理提出请求，由你决定。每个代理持有的是 Elyra 密钥，而不是钱包密钥。授权书规定它可以请求什么、额度多少；每个请求都受其约束，没有你的签名任何资金都不会移动——除非是你允许自动执行的永续合约订单。",
};
