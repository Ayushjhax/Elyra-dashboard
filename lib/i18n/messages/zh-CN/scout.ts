import type { Messages } from "../../translate";

/* Simplified Chinese — Scout: link reads, smart money, auto-buys, Poly scan and Poly baskets (components/scout, lib/scout, lib/poly). */

export const scout: Messages = {
  /* The page */
  "Scout":
    "Scout 侦察",
  "Read any YouTube video, post or article with every claim graded by its evidence, see what smart money did, set auto-buys, and scan Polymarket.":
    "解读任意 YouTube 视频、帖子或文章，按证据为每条说法评级，查看聪明钱的动向，设置自动买入，并扫描 Polymarket。",
  "Evidence first, then smart money":
    "先看证据，再看聪明钱",
  "Read":
    "解读",
  "Auto-buys":
    "自动买入",
  "Poly scan":
    "Poly 扫描",
  "Poly baskets":
    "Poly 组合",

  /* Grades */
  "Reported":
    "媒体报道",
  "Speculation":
    "猜测",
  "Opinion":
    "观点",
  "The party itself says so, in its own channel.":
    "当事方本人在自己的渠道中这样说。",
  "A newsroom states it as fact.":
    "新闻机构将其作为事实报道。",
  "Stated as fact, but not by the party itself or a newsroom.":
    "以事实口吻陈述，但并非出自当事方本人或新闻机构。",
  "Framed as possible, rumoured or expected — not as fact.":
    "以可能、传闻或预期的口吻表述——并非事实。",
  "A view, a forecast or a price call.":
    "一种看法、预测或价格判断。",
  "From the party itself":
    "来自当事方本人",
  "Newsroom":
    "新闻机构",
  "Unverified source":
    "未经核实的来源",

  /* Read */
  "Read a video, post or article":
    "解读视频、帖子或文章",
  "Two posts land at once: one says an exchange has officially announced a listing, the other that people are speculating about one. Attention goes to the louder one first. Scout grades every claim by who said it and how, checks listings against the exchanges' own feeds, and shows what smart money actually did — strongest evidence first, never loudest.":
    "两条帖子同时出现：一条说某交易所已正式宣布上币，另一条说大家在猜测它会上币。注意力会先被更响亮的那条吸引。Scout 按说话的人和说法为每条说法评级，用交易所自己的公告核对上币消息，并展示聪明钱实际做了什么——证据最强的排在前面，而不是声音最大的。",
  "What to read":
    "解读内容",
  "Links":
    "链接",
  "Paste text":
    "粘贴文本",
  "Up to three links, one per line: YouTube, X or any article":
    "最多三个链接，每行一个：YouTube、X 或任意文章",
  "A post's text, when the link cannot be read":
    "链接无法读取时，粘贴帖子的文字",
  "Sign in to read links.":
    "登录后即可解读链接。",
  "Free: Gemini's free tier reads the source; Hyperliquid, Bybit, OKX and Upbit's public data check it. Each new link uses one of your daily AI runs; a link anyone read today uses none. Nothing here places a trade.":
    "免费：由 Gemini 免费额度读取来源，并用 Hyperliquid、Bybit、OKX 和 Upbit 的公开数据核对。每个新链接占用一次你当日的 AI 次数；今天已有人解读过的链接不占用。这里不会下任何单。",
  "Reading, grading the claims and checking smart money… a video takes up to a minute.":
    "正在读取、为说法评级并核对聪明钱……视频最多需要一分钟。",
  "Scout could not read that.":
    "Scout 无法读取该内容。",
  "Your reads":
    "你的解读",
  "Your reads, side by side":
    "你的解读，并排对比",
  "Words transcribed by Gemini from the video's first 20 minutes. Names and numbers can be misheard.":
    "文字由 Gemini 根据视频前 20 分钟转写。名称和数字可能听错。",
  "Text read from the page itself.":
    "文字读取自页面本身。",
  "The site blocks readers, so Gemini fetched the page through Google and copied its text. It can leave words out.":
    "该网站阻止自动读取，因此由 Gemini 通过 Google 获取页面并复制其文字。可能会遗漏部分内容。",
  "Text from X's public embed of the post.":
    "文字来自 X 对该帖子的公开嵌入。",
  "Text you pasted. Scout cannot tell who wrote it, so nothing in it counts as official.":
    "这是你粘贴的文字。Scout 无法判断作者，因此其中任何内容都不算官方消息。",
  "Buying":
    "买入",
  "Selling":
    "卖出",
  "Quiet":
    "无明显动作",
  "Smart money agrees with the source":
    "聪明钱与来源的判断一致",
  "Smart money is doing the opposite":
    "聪明钱的动作与来源相反",
  "No clear smart-money move":
    "聪明钱没有明显动作",
  "Bullish":
    "看涨",
  "Bearish":
    "看跌",
  "Confirmed by {exchange}'s own listing announcement: ":
    "已由 {exchange} 自己的上币公告证实：",
  "Its own words hedge (“reportedly”, “could”, “sources say”), so it counts as speculation.":
    "原文措辞留有余地（“据报道”“可能”“消息人士称”），因此按猜测处理。",
  "No listing of {asset} in the last 21 days of announcements from {feeds}.":
    "过去 21 天内，{feeds} 的公告中没有 {asset} 的上币信息。",
  "Scout cannot check {exchange}'s own listings for free; it reads Bybit, OKX and Upbit. Check {exchange}'s announcements yourself.":
    "Scout 无法免费核对 {exchange} 自己的上币公告；它读取的是 Bybit、OKX 和 Upbit。请自行查看 {exchange} 的公告。",
  "1 claim the AI offered was dropped: its quote is not in the source.":
    "AI 提出的 1 条说法已被剔除：其引文不在来源中。",
  "since it was published":
    "自发布以来",
  "in 24 hours":
    "24 小时内",
  "No smart-money wallet traded it in the last {hours} h.":
    "过去 {hours} 小时内没有聪明钱钱包交易它。",
  "In the last {hours} h, {long} smart-money wallets opened longs and {short} opened shorts; {closed} closed.":
    "过去 {hours} 小时内，{long} 个聪明钱钱包开多，{short} 个开空；{closed} 个平仓。",
  "Smart money holds it {side}: {wallets} of {total} wallets.":
    "聪明钱持有其{side}仓：{total} 个钱包中的 {wallets} 个。",
  "Smart money holds it {side}: {wallets} wallets.":
    "聪明钱持有其{side}仓：{wallets} 个钱包。",
  "{wallets} of {total} wallets":
    "{total} 个钱包中的 {wallets} 个",
  "{wallets} wallets":
    "{wallets} 个钱包",
  "Could not be read just now.":
    "暂时无法读取。",
  "What the most profitable Hyperliquid traders over 30 days opened, closed and hold, from Hyperliquid's public data. Counted by wallet, not by dollar. Observational, not financial advice.":
    "Hyperliquid 过去 30 天最赚钱的交易者开了什么、平了什么、持有什么，来自 Hyperliquid 的公开数据。按钱包计数，而非按金额。仅为观察，不构成投资建议。",
  "Attention words: {words}. Loud words do not make a claim more likely.":
    "吸睛用语：{words}。声音大并不会让一个说法更可能成真。",
  "Claims":
    "说法",
  "Claims, strongest evidence first":
    "说法，证据最强的在前",
  "No claim a trader could check was found in this source.":
    "这个来源中没有交易者可以核对的说法。",
  "Smart-money check":
    "聪明钱核对",
  "{count} claims the AI offered were dropped: their quotes are not in the source.":
    "AI 提出的 {count} 条说法已被剔除：其引文不在来源中。",
  "Answered from Scout's shared cache — no AI run used.":
    "来自 Scout 的共享缓存——未占用 AI 次数。",
  "Read by {model} on Google's free tier.":
    "由 {model} 在 Google 免费额度上解读。",
  "Read {when}.":
    "解读于{when}。",

  /* Smart money */
  "Window":
    "时间窗口",
  "6 hours":
    "6 小时",
  "A market where at least three of the cohort opened the same side in the window, and few opened the other. Counted by wallet: one whale is one opinion.":
    "在时间窗口内，至少三个聪明钱钱包在同一方向开仓、而反向开仓很少的市场。按钱包计数：一头巨鲸只算一个观点。",
  "No signal in the last {hours} h. Smart money is not crowding into one side of anything.":
    "过去 {hours} 小时内没有信号。聪明钱没有在任何市场集中押注一个方向。",
  "Opening longs":
    "正在开多",
  "Opening shorts":
    "正在开空",
  "{wallets} wallets · {against} against · {usd}":
    "{wallets} 个钱包 · {against} 个反向 · {usd}",
  "What the cohort traded":
    "聪明钱交易了什么",
  "{read} of {wallets} wallets read":
    "已读取 {wallets} 个钱包中的 {read} 个",
  "The cohort has not traded in this window.":
    "这一时间窗口内聪明钱没有交易。",
  "Opened: {long} long, {short} short · Closed: {closedLong} long, {closedShort} short":
    "开仓：多 {long}，空 {short} · 平仓：多 {closedLong}，空 {closedShort}",
  "What they hold now":
    "他们现在持有什么",
  "Official listing announcements":
    "官方上币公告",
  "From the exchanges' own feeds, not posts about them. A listing claim in a read is checked against these.":
    "来自交易所自己的公告源，而非关于公告的帖子。解读中的上币说法会与这些公告核对。",
  "No crypto listing announced in the last week.":
    "过去一周没有加密货币上币公告。",
  "Listing":
    "上币",
  "Delisting":
    "下架",
  "Trades on Hyperliquid: {coins}":
    "可在 Hyperliquid 交易：{coins}",

  /* Auto-buys */
  "A rule opens a trade when code sees a signal: smart money crowding into a market, or an exchange's own listing announcement. Paper unless you choose live. Every order goes through the chart ticket's own path, with its take-profit and stop-loss, your account limits and your daily loss limit. A video or article you read never triggers a trade.":
    "当代码发现信号时，规则会开仓：聪明钱集中涌入某个市场，或交易所发布自己的上币公告。除非你选择实盘，否则使用模拟盘。每笔订单都走图表下单的同一路径，附带止盈止损，并受你的账户限制和每日亏损上限约束。你解读的视频或文章永远不会触发交易。",
  "No rules yet.":
    "还没有规则。",
  "What the rules did":
    "规则的执行记录",
  "Nothing yet. The rules are checked every five minutes.":
    "暂无记录。规则每五分钟检查一次。",
  "Opened":
    "已开仓",
  "Not opened":
    "未开仓",
  "Sign in to set up auto-buys.":
    "登录后即可设置自动买入。",
  "Listing buyer":
    "上币买入",
  "Smart-money follower":
    "跟随聪明钱",
  "Trigger":
    "触发条件",
  "Smart money opens":
    "聪明钱开仓",
  "Official listing":
    "官方上币",
  "Fires when at least the wallets you set, from the most profitable Hyperliquid traders, open the same side of a market within an hour. Once per market, side and day.":
    "当 Hyperliquid 最赚钱的交易者中，至少有你设定数量的钱包在一小时内于同一市场同向开仓时触发。每个市场、方向每天一次。",
  "Fires when Bybit, OKX or Upbit announces, in its own feed, a listing of a coin Hyperliquid trades. Only announcements from the last two hours; only buys.":
    "当 Bybit、OKX 或 Upbit 在自己的公告中宣布上线一个 Hyperliquid 可交易的币时触发。只看过去两小时内的公告；只做买入。",
  "Follow":
    "跟随",
  "Longs":
    "多单",
  "Both":
    "多空皆可",
  "Markets: every crypto market Elyra trades":
    "市场：Elyra 交易的所有加密市场",
  "Markets: {count} chosen":
    "市场：已选 {count} 个",
  "Wallets at least":
    "钱包数至少",
  "Size (USD)":
    "规模（美元）",
  "Take-profit %":
    "止盈 %",
  "Stop-loss %":
    "止损 %",
  "Trades a day at most":
    "每天最多交易次数",
  "Live trading is switched off on this server, so rules run on paper.":
    "此服务器已关闭实盘交易，因此规则以模拟盘运行。",
  "When {wallets}+ smart-money wallets open {side}":
    "当 {wallets} 个以上聪明钱钱包开{side}时",
  "either side":
    "任一方向",
  "longs":
    "多",
  "shorts":
    "空",
  "When an exchange officially announces a listing":
    "当交易所正式宣布上币时",
  "On":
    "运行中",
  "${size} at {leverage}x · take-profit {tp}% · stop-loss {sl}% · {used} of {max} today":
    "${size}，{leverage} 倍 · 止盈 {tp}% · 止损 {sl}% · 今日 {used}/{max}",

  /* Poly scan */
  "Leaderboard":
    "排行榜",
  "Politics":
    "政治",
  "Basket ({count})":
    "组合（{count}）",
  "Basket":
    "加入组合",
  "In basket":
    "已在组合中",
  "Add to basket":
    "加入组合",
  "Remove from basket":
    "移出组合",
  "Polymarket smart money":
    "Polymarket 聪明钱",
  "Open positions of Polymarket's most profitable wallets over 30 days, from its own leaderboard. An outcome shows when at least three of them hold it and two thirds of those in the market agree.":
    "Polymarket 过去 30 天最赚钱钱包的未平仓头寸，来自其官方排行榜。当至少三个钱包持有同一结果、且该市场中三分之二的此类钱包意见一致时显示。",
  "{read} of {asked} wallets read":
    "已读取 {asked} 个钱包中的 {read} 个",
  "The top wallets do not agree on any open outcome right now.":
    "头部钱包目前没有在任何未结算结果上达成一致。",
  "{wallets} top wallets, {against} on the other side · {value} held · entered near {entry}, now {price}":
    "{wallets} 个头部钱包，{against} 个持相反结果 · 持有 {value} · 入场约 {entry}，现价 {price}",
  "Biggest moves today":
    "今日最大波动",
  "No liquid market moved four points or more today.":
    "今天没有流动性充足的市场波动达到四个点。",
  "points · now {price} · {volume} traded today":
    "个点 · 现价 {price} · 今日成交 {volume}",
  "Books that do not add up":
    "加总不等于 1 的订单簿",
  "In an event with exactly one winner, buying YES on every outcome should cost about $1. Under $1 at the asks, or over $1 at the bids, is a gap. Before fees and before depth: the best quote may hold only a few shares.":
    "在只有一个赢家的事件中，买入每个结果的 YES 应花费约 $1。卖价合计低于 $1，或买价合计高于 $1，就是价差。未计手续费与深度：最优报价可能只有几股。",
  "Every busy one-winner event adds up to within half a point.":
    "所有活跃的单一赢家事件加总都在半个点以内。",
  "{outcomes} outcomes · asks sum to {ask} · bids sum to {bid}":
    "{outcomes} 个结果 · 卖价合计 {ask} · 买价合计 {bid}",
  "Every outcome costs {gap} points under $1.":
    "买入全部结果比 $1 低 {gap} 个点。",
  "Every outcome sells for {gap} points over $1.":
    "卖出全部结果比 $1 高 {gap} 个点。",
  "Prices are Polymarket's; nothing here is a forecast. Elyra places no Polymarket orders — open a market on Polymarket to trade it, where its own terms and regional limits apply.":
    "价格来自 Polymarket；这里的内容都不是预测。Elyra 不在 Polymarket 下单——如需交易，请在 Polymarket 打开该市场，并遵守其条款和地区限制。",

  /* Poly baskets */
  "My basket":
    "我的组合",
  "Pick outcomes in Poly scan — what smart money holds, or today's movers — and make a paper basket from them here.":
    "在 Poly 扫描中挑选结果——聪明钱持有的，或今日波动最大的——然后在这里组成模拟组合。",
  "Open Poly scan":
    "打开 Poly 扫描",
  "Paper stake (USD)":
    "模拟金额（美元）",
  "Add at least {count} outcomes.":
    "至少添加 {count} 个结果。",
  "The stake is split evenly; each leg is bought at the order book walked for its share, not the midpoint.":
    "金额平均分配；每一腿按订单簿逐档成交的价格买入，而不是中间价。",
  "Make paper basket":
    "创建模拟组合",
  "Clear":
    "清空",
  "Cost {cost} · {settled} of {legs} settled":
    "成本 {cost} · {legs} 腿中已结算 {settled} 腿",
  "{shares} shares at {entry}¢ · cost {cost} · worth {value}":
    "{shares} 股，价格 {entry}¢ · 成本 {cost} · 现值 {value}",
  "· Won":
    "· 赢",
  "· Lost":
    "· 输",
  "Sign in to keep paper baskets.":
    "登录后即可保存模拟组合。",
  "New paper basket":
    "新模拟组合",
  "Your baskets":
    "你的组合",
  "No baskets yet.":
    "还没有组合。",
  "Paper only: Elyra places no Polymarket orders. Values are what the shares would sell for into the book now, so a thin book shows less than its midpoint.":
    "仅限模拟：Elyra 不在 Polymarket 下单。现值是这些股份此刻卖入订单簿可得的金额，因此深度不足时会低于中间价。",
};
