import type { Messages } from "../../translate";

/* Simplified Chinese — components/connections. */

export const connections: Messages = {
  " · {spotBalanceCount} spot balance":
    " · {spotBalanceCount} 项现货余额",
  " · {spotBalanceCount} spot balances":
    " · {spotBalanceCount} 项现货余额",
  ". Each key may make 60 calls a minute and 2,000 a day.":
    "。每个密钥每分钟最多调用 60 次，每天最多 2,000 次。",
  "· {positionCount} open position":
    "· {positionCount} 个未平仓头寸",
  "· {positionCount} open positions":
    "· {positionCount} 个未平仓头寸",
  "(opens Telegram in a new tab)":
    "（在新标签页中打开 Telegram）",
  "{activeMarkets} open market":
    "{activeMarkets} 个进行中的市场",
  "{activeMarkets} open markets":
    "{activeMarkets} 个进行中的市场",
  "{count} accounts hold positions for your wallet. Choose yours — nothing is linked until you do.":
    "有 {count} 个账户为你的钱包持有头寸。请选择你的账户——在你选择之前不会关联任何账户。",
  "{origin}/api/mcp":
    "{origin}/api/mcp",
  "{positionCount} position worth ":
    "{positionCount} 个头寸，价值 ",
  "{positionCount} positions worth ":
    "{positionCount} 个头寸，价值 ",
  "/link {code}":
    "/link {code}",
  "A Telegram chat":
    "一个 Telegram 聊天",
  "Account value":
    "账户价值",
  "Accounts found for your wallet":
    "与你的钱包对应的账户",
  "AI agents":
    "AI 代理",
  "Also let it read my portfolio, positions, orders and activity":
    "同时允许它读取我的投资组合、头寸、订单和动态",
  "An address starts 0x and is 42 characters long.":
    "地址以 0x 开头，共 42 个字符。",
  "Any MCP client that takes a JSON config (Cursor, Windsurf and others)":
    "任何使用 JSON 配置的 MCP 客户端（Cursor、Windsurf 等）",
  "API key":
    "API 密钥",
  "API key stored":
    "已保存 API 密钥",
  "API secret":
    "API 私钥",
  "Awaiting link":
    "等待关联",
  "Bring your accounts into Elyra":
    "把你的账户接入 Elyra",
  "Check":
    "检查",
  "Check your connected wallet, {address}, for Polymarket positions":
    "在你已连接的钱包 {address} 中查找 Polymarket 头寸",
  "Checking {address}…":
    "正在检查 {address}…",
  "Checking for a linked account…":
    "正在检查已关联的账户…",
  "Checking for a stored key…":
    "正在检查已保存的密钥…",
  "Checking for a wallet…":
    "正在查找钱包…",
  "Checking the key with Binance…":
    "正在与 Binance 核验密钥…",
  "Checking your Telegram link…":
    "正在检查你的 Telegram 关联…",
  "Checking your wallet…":
    "正在检查你的钱包…",
  "Checking…":
    "正在检查…",
  "Claude Code":
    "Claude Code",
  "Claude Code on my laptop":
    "我笔记本上的 Claude Code",
  "claude mcp add --transport http elyra {endpoint} --header \"Authorization: Bearer {keyText}\"":
    "claude mcp add --transport http elyra {endpoint} --header \"Authorization: Bearer {keyText}\"",
  "Code expired":
    "代码已过期",
  "Connect Binance":
    "连接 Binance",
  "Connect Telegram":
    "连接 Telegram",
  "Connected":
    "已连接",
  "Connected {connectedAt}":
    "连接于 {connectedAt}",
  "Connecting":
    "连接中",
  "Connection access stays read-only":
    "连接访问始终为只读",
  "Connections":
    "连接",
  "Copied the linking code":
    "已复制关联代码",
  "Copy the Claude Code command":
    "复制 Claude Code 命令",
  "Copy the curl example":
    "复制 curl 示例",
  "Copy the linking code":
    "复制关联代码",
  "Copy the MCP config":
    "复制 MCP 配置",
  "Copy the new agent key":
    "复制新的代理密钥",
  "Could not check that address. Try again.":
    "无法检查该地址，请重试。",
  "Could not check whether a Binance key is stored.":
    "无法确认是否已保存 Binance 密钥。",
  "Could not check whether an account is linked.":
    "无法确认是否已关联账户。",
  "Could not check whether Telegram is linked.":
    "无法确认是否已关联 Telegram。",
  "Could not check which address Hyperliquid is read from.":
    "无法确认 Hyperliquid 读取的是哪个地址。",
  "Could not connect Binance. Nothing was saved.":
    "无法连接 Binance，未保存任何内容。",
  "Could not copy the code. Select it instead.":
    "无法复制代码，请手动选中。",
  "Could not disconnect Binance. The key is still stored.":
    "无法断开 Binance，密钥仍已保存。",
  "Could not generate a code. Try again.":
    "无法生成代码，请重试。",
  "Could not link that account. Nothing was changed.":
    "无法关联该账户，未做任何更改。",
  "Could not reach Elyra to check that address.":
    "无法连接 Elyra 检查该地址。",
  "Could not reach Elyra to connect Binance. Nothing was saved.":
    "无法连接 Elyra 以接入 Binance，未保存任何内容。",
  "Could not reach Elyra to generate a code. Check your connection and try again.":
    "无法连接 Elyra 生成代码。请检查网络后重试。",
  "Could not reach Elyra to read that address.":
    "无法连接 Elyra 读取该地址。",
  "Could not reach Elyra to search. Check your connection and try again.":
    "无法连接 Elyra 进行搜索。请检查网络后重试。",
  "Could not reach Elyra to unlink. The chat is still linked.":
    "无法连接 Elyra 取消关联，聊天仍处于关联状态。",
  "Could not read that address. Try again.":
    "无法读取该地址，请重试。",
  "Could not read the account: {reason}":
    "无法读取账户：{reason}",
  "Could not read your notification settings.":
    "无法读取你的通知设置。",
  "Could not remove the saved address. It is still the one being read.":
    "无法移除已保存的地址，当前仍在读取该地址。",
  "Could not save that address. Nothing was changed.":
    "无法保存该地址，未做任何更改。",
  "Could not save that. Nothing was changed.":
    "无法保存，未做任何更改。",
  "Could not search for your account. Try again.":
    "无法搜索你的账户，请重试。",
  "Could not unlink Telegram. The chat is still linked.":
    "无法取消关联 Telegram，聊天仍处于关联状态。",
  "Could not unlink. The account is still linked.":
    "无法取消关联，账户仍处于关联状态。",
  "Couldn't check":
    "无法检查",
  "Create key":
    "创建密钥",
  "Creating…":
    "正在创建…",
  "curl -X POST {origin}/api/v1/tools/get_market_snapshot -H \"Authorization: Bearer {keyText}\" -H \"content-type: application/json\" -d '{\"symbols\":[\"BTC\",\"NVDA\"]}'":
    "curl -X POST {origin}/api/v1/tools/get_market_snapshot -H \"Authorization: Bearer {keyText}\" -H \"content-type: application/json\" -d '{\"symbols\":[\"BTC\",\"NVDA\"]}'",
  "Daily summary":
    "每日摘要",
  "Disable trading permissions and configure an IP allowlist.":
    "关闭交易权限并配置 IP 白名单。",
  "Disconnect":
    "断开连接",
  "Enable Reading":
    "启用读取",
  "Endpoint":
    "端点",
  "Enter an address manually":
    "手动输入地址",
  "Exchanges":
    "交易所",
  "Expires in":
    "剩余有效期",
  "Find my account":
    "查找我的账户",
  "Generate a new code":
    "生成新代码",
  "Generating a code…":
    "正在生成代码…",
  "Generating…":
    "正在生成…",
  "Give Claude, ChatGPT or your own agent Elyra's live market context over MCP. Read-only until you grant it a mandate in Agents.":
    "通过 MCP 为 Claude、ChatGPT 或你自己的代理提供 Elyra 的实时市场信息。在“代理”中授予授权书之前，它只能读取。",
  "Hide API secret":
    "隐藏 API 私钥",
  "How to connect an agent":
    "如何连接代理",
  "Hyperliquid address":
    "Hyperliquid 地址",
  "I have saved it":
    "我已保存",
  "If you restrict the key to trusted IPs, the list has to include the address Elyra connects from, or Binance will refuse the check.":
    "如果你将密钥限制为受信任的 IP，列表中必须包含 Elyra 的连接地址，否则 Binance 会拒绝核验。",
  "In Binance, open API Management and create a system-generated key.":
    "在 Binance 中打开 API 管理，创建一个系统生成的密钥。",
  "Keep it":
    "保留",
  "Keep the current key":
    "保留当前密钥",
  "Key ending {keyLastFour}":
    "尾号 {keyLastFour} 的密钥",
  "Key for {name}. Copy it now — Elyra keeps only a fingerprint and cannot show it again.":
    "{name} 的密钥。请立即复制——Elyra 只保存其指纹，无法再次显示。",
  "Large moves":
    "大幅波动",
  "Leave only":
    "只保留",
  "Levels you set on the chart.":
    "你在图表上设定的价位。",
  "Link anyway":
    "仍然关联",
  "Link it anyway if the account is new. Otherwise, check the address.":
    "如果是新账户，可以照常关联；否则请核对地址。",
  "Link this account":
    "关联此账户",
  "Linked {linkedAt}":
    "关联于 {linkedAt}",
  "Linking code":
    "关联代码",
  "Linking…":
    "正在关联…",
  "Liquidation warnings":
    "强平预警",
  "Loading…":
    "加载中…",
  "Market data and your account":
    "市场数据和你的账户",
  "Market data only":
    "仅市场数据",
  "Needs attention":
    "需要处理",
  "never used":
    "从未使用",
  "New key, named for the agent that will use it":
    "新密钥，以将要使用它的代理命名",
  "No keys":
    "无密钥",
  "No open positions right now.":
    "目前没有未平仓头寸。",
  "No open positions, but recent activity":
    "没有未平仓头寸，但有近期动态",
  "No Polymarket account was found for your wallet.":
    "没有找到与你的钱包对应的 Polymarket 账户。",
  "No positions or activity at this address":
    "该地址没有头寸或动态",
  "Not linked":
    "未关联",
  "Nothing held at this address":
    "该地址没有持仓",
  "Nothing was found at this address when it was linked. That is normal for a new account; if you expected positions, check the address.":
    "关联时该地址下没有任何内容。新账户通常如此；如果你预期有头寸，请核对地址。",
  "On polymarket.com, open your profile and copy the address shown under your name. Polymarket holds positions in a wallet it creates for you, so this is usually not the wallet you sign in with.":
    "在 polymarket.com 上打开你的个人资料，复制你名字下方显示的地址。Polymarket 会把头寸存放在它为你创建的钱包里，所以这通常不是你登录用的钱包。",
  "on. Elyra checks the key’s permissions with Binance and refuses one that can trade, transfer or withdraw.":
    "处于开启状态。Elyra 会向 Binance 核验密钥权限，拒绝任何可交易、转账或提现的密钥。",
  "One message a day with where your capital stands.":
    "每天一条消息，告诉你资金的现状。",
  "Open Binance API Management":
    "打开 Binance API 管理",
  "Open chat":
    "打开聊天",
  "Open Telegram to link":
    "打开 Telegram 进行关联",
  "Paste the key and secret here. They are encrypted on arrival and never shown again.":
    "在这里粘贴密钥和私钥。它们在到达时即被加密，之后不会再显示。",
  "Paste the whole key — letters and numbers only, no spaces.":
    "请粘贴完整的密钥——只含字母和数字，不含空格。",
  "Paste the whole secret — letters and numbers only, no spaces.":
    "请粘贴完整的私钥——只含字母和数字，不含空格。",
  "Paste your API key":
    "粘贴你的 API 密钥",
  "Paste your API secret":
    "粘贴你的 API 私钥",
  "Polymarket address":
    "Polymarket 地址",
  "Position-holding address":
    "持有头寸的地址",
  "Positions could not be read: {readFailed}":
    "无法读取头寸：{readFailed}",
  "Price alerts":
    "价格提醒",
  "Read a different address":
    "读取其他地址",
  "Read your positions and equity.":
    "读取你的头寸和权益。",
  "Read-only access":
    "只读访问",
  "Read-only API access required":
    "需要只读 API 权限",
  "Reading…":
    "正在读取…",
  "Remove saved address":
    "移除已保存的地址",
  "Remove the stored key?":
    "移除已保存的密钥？",
  "Removing…":
    "正在移除…",
  "Replace key":
    "更换密钥",
  "Restoring your session…":
    "正在恢复你的会话…",
  "Revoke":
    "撤销",
  "Revoke {name}? Agents using it stop working at once.":
    "撤销 {name}？使用它的代理会立即停止工作。",
  "Revoke key":
    "撤销密钥",
  "Revoking…":
    "正在撤销…",
  "Same agent, accounts and preferences.":
    "同一个代理、账户和偏好设置。",
  "Saved address":
    "已保存的地址",
  "Saving…":
    "正在保存…",
  "Searching":
    "搜索中",
  "Searching your wallet…":
    "正在搜索你的钱包…",
  "See your positions alongside the rest of your capital.":
    "把你的头寸和其他资金放在一起查看。",
  "Send":
    "发送",
  "Session wallet":
    "会话钱包",
  "Setup guide":
    "设置指南",
  "Show API secret":
    "显示 API 私钥",
  "Sign in to connect Telegram, Polymarket and your exchanges.":
    "登录后即可连接 Telegram、Polymarket 和你的交易所。",
  "Sign-in is not configured on this deployment, so there is no account to connect anything to.":
    "此部署未配置登录，因此没有可连接的账户。",
  "Single use · valid for {lifetimeMs}":
    "一次性使用 · 有效期 {lifetimeMs}",
  "Telegram is not set up on this deployment, so there is no bot to link.":
    "此部署未设置 Telegram，没有可关联的机器人。",
  "That code expired and no longer works. Codes are single use and last {lifetimeMs}.":
    "该代码已过期，无法再使用。代码为一次性使用，有效期 {lifetimeMs}。",
  "The address you trade from on Hyperliquid. It is read, never traded from.":
    "你在 Hyperliquid 上交易使用的地址。只读取，从不用于交易。",
  "The key could not be created.":
    "无法创建密钥。",
  "The key could not be revoked.":
    "无法撤销密钥。",
  "This account has no EVM wallet to read Hyperliquid from. Enter the address that holds your Hyperliquid account instead.":
    "此账户没有可读取 Hyperliquid 的 EVM 钱包。请改为输入持有你 Hyperliquid 账户的地址。",
  "This account has no EVM wallet, so enter the address that holds your positions.":
    "此账户没有 EVM 钱包，请输入持有你头寸的地址。",
  "This is mine — link it":
    "这是我的——关联它",
  "This is mine — use it":
    "这是我的——使用它",
  "This key has no IP allowlist. Adding one in Binance limits where the key can be used from.":
    "此密钥没有 IP 白名单。在 Binance 中添加白名单可以限制密钥的使用来源。",
  "to the Elyra bot in Telegram.":
    "给 Telegram 中的 Elyra 机器人。",
  "Unlink":
    "取消关联",
  "Unlink Telegram? The chat stops answering for this account.":
    "取消关联 Telegram？该聊天将不再为此账户回复。",
  "Unlinking…":
    "正在取消关联…",
  "Unverified":
    "未验证",
  "Use connected wallet":
    "使用已连接的钱包",
  "Use it anyway":
    "仍然使用",
  "Use it anyway if the account is new. Otherwise, check the address.":
    "如果是新账户，可以照常使用；否则请核对地址。",
  "Use session wallet instead":
    "改用会话钱包",
  "Use the address that holds your Polymarket positions. ":
    "请使用持有你 Polymarket 头寸的地址。",
  "used {lastUsedAt}":
    "上次使用 {lastUsedAt}",
  "View balances and positions. Trading actions are unavailable here.":
    "查看余额和头寸。这里不提供交易操作。",
  "Wallet access · No API key needed":
    "钱包访问 · 无需 API 密钥",
  "What Elyra sends you":
    "Elyra 会给你发送什么",
  "When a DeFi position approaches its published liquidation threshold.":
    "当 DeFi 头寸接近其公布的强平阈值时。",
  "When something you hold moves more than your threshold.":
    "当你持有的资产波动超过你设定的阈值时。",
  "Where do I find it?":
    "在哪里找到它？",
  "Without MCP — plain HTTP":
    "不使用 MCP——直接 HTTP",
  "Without this, the key reads market data only.":
    "不勾选时，密钥只能读取市场数据。",
  "Your Elyra agent, wherever you are":
    "你的 Elyra 代理，随时随地",
  "Your keys could not be loaded.":
    "无法加载你的密钥。",
  "Your previous code no longer works.":
    "你之前的代码已失效。",
};
