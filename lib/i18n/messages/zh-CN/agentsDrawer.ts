import type { Messages } from "../../translate";

/* Simplified Chinese — the Agents drawer: the permission model, pending
   requests, agents and mandates, Get paid, activity and the ledger
   (components/rails). */

export const agentsDrawer: Messages = {
  "{amount} USDC":
    "{amount} USDC",
  "{count} events, verified;":
    "共 {count} 个事件，已验证；",
  "1 event, verified;":
    "共 1 个事件，已验证；",
  "A chained history of every mandate, request, outcome and payment, each event sealed with the SHA-256 of the one before.":
    "每项授权、请求、结果和付款的链式记录，每个事件都用前一个事件的 SHA-256 封存。",
  "A request may ask for at most {max} USDC.":
    "一笔请求最多可收取 {max} USDC。",
  "Ask to be paid in USDC":
    "请求以 USDC 收款",
  "Awaiting payment":
    "待付款",
  "Cancel the request for {label}":
    "取消“{label}”的收款请求",
  "Create a key in Connections, then set its mandate here. Granting a mandate is a separate step: until you grant one, the key can only read.":
    "先在“连接”中创建密钥，再在这里设置授权。授予授权是单独的一步：在你授予之前，该密钥只能读取。",
  "Create another agent key":
    "再创建一个代理密钥",
  "Each agent uses an Elyra key, never a wallet key. Its mandate limits which actions it can request and for how much. Swaps and payments are signed in your own wallet; perp orders need your approval, unless you let them run inside the mandate.":
    "每个代理使用 Elyra 密钥，从不使用钱包密钥。它的授权限定了可以请求哪些操作以及金额上限。兑换和付款在你自己的钱包中签名；永续合约订单需要你的批准，除非你允许它们在授权范围内自动执行。",
  "Enter an amount of USDC above zero, such as 12.50.":
    "请输入大于零的 USDC 金额，例如 12.50。",
  "Everything an agent asks for — done, declined or refused — is listed here with its outcome and the reason.":
    "代理提出的每项请求——已完成、被你拒绝或被授权拒绝——都会连同结果和原因列在这里。",
  "Exporting…":
    "正在导出…",
  "head":
    "链头",
  "Its status is checked against the chain every ten seconds while it is open here.":
    "在此处打开期间，每十秒对照链上数据检查一次状态。",
  "No activity yet.":
    "暂无动态。",
  "No agents connected.":
    "尚未连接代理。",
  "No pending requests.":
    "没有待处理的请求。",
  "Open the pay page":
    "打开付款页面",
  "Paid on Solana, confirmed from the chain and recorded in your ledger.":
    "已在 Solana 上付款，经链上确认并记入你的账本。",
  "Pay in USDC on Solana":
    "在 Solana 上用 USDC 付款",
  "Payment":
    "付款",
  "payment link":
    "付款链接",
  "Permissions and requests":
    "权限与请求",
  "Perp order":
    "永续合约订单",
  "Reason:":
    "原因：",
  "Recent requests":
    "最近的请求",
  "Request USDC on Solana with a payment link and a Solana Pay code. It is paid straight to your own wallet — Elyra never holds the money.":
    "通过付款链接和 Solana Pay 二维码在 Solana 上收取 USDC。款项直接进入你自己的钱包——Elyra 从不经手资金。",
  "Say what it is for — the payer sees it.":
    "请说明用途——付款人会看到它。",
  "Scan with any Solana Pay wallet.":
    "可用任何 Solana Pay 钱包扫码。",
  "Swap tokens on Solana":
    "在 Solana 上兑换代币",
  "This account has no Solana wallet to be paid into.":
    "此账户没有可收款的 Solana 钱包。",
  "This request lapsed before it was paid.":
    "这笔请求在付款前已失效。",
  "Trade Hyperliquid perps":
    "交易 Hyperliquid 永续合约",
  "When an agent asks for something inside its mandate, it appears here and you are notified.":
    "当代理在授权范围内提出请求时，会显示在这里并通知你。",
  "Your new payment request":
    "你的新收款请求",
};
