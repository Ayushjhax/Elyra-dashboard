import type { Messages } from "../../translate";

/* Simplified Chinese — components/desk and lib/desk's seats. "Desk" is 委员会, the committee. */

export const desk: Messages = {
  "Desk":
    "委员会",
  "A committee of AI models from Anthropic, Cohere, Google and others forecasts one market question together, by a fixed procedure, and is scored on it. Words only — it never trades.":
    "由 Anthropic、Cohere、Google 等多家实验室的 AI 模型组成的委员会，按固定流程共同预测一个市场问题，并据此计分。只输出文字——从不交易。",
  "Many models, one committee":
    "多个模型，一个委员会",
  "Fact sheet":
    "事实表",
  "Assignments":
    "分工",
  "Independent views":
    "独立观点",
  "Anonymised review":
    "匿名互评",
  "Vote and memo":
    "投票与备忘录",
  "{minutes}m":
    "{minutes} 分",
  "Settles in":
    "结算时间",
  "Anything for the desk to weigh (optional)":
    "希望委员会考虑的内容（可选）",
  "An event, a worry, a hunch":
    "一个事件、一个担忧、一个直觉",
  "The question is always one the market will settle: will it close above its price now, at that time?":
    "问题始终由市场来结算：到那个时间点，它会收在当前价格之上吗？",
  "1 member will vote.":
    "将有 1 位成员投票。",
  "{count} members will vote.":
    "将有 {count} 位成员投票。",
  "{left} of {perDay} sessions left today.":
    "今天还剩 {left} / {perDay} 次会议。",
  "The desk is in session":
    "委员会正在开会",
  "Convening":
    "正在召集",
  "Convene the desk":
    "召集委员会",
  "Where the desk is":
    "委员会进度",
  "After review: {thesis}":
    "互评后：{thesis}",
  "Weight {weight}":
    "权重 {weight}",
  "Waiting for review":
    "等待互评",
  "Brier {brier}":
    "Brier {brier}",
  "{market}, {horizon}":
    "{market}，{horizon}",
  "Will it be true? {market} closes above {price} at {time} UTC.":
    "这会成立吗？{market} 在 UTC {time} 的收盘价高于 {price}。",
  "Your note: {note}":
    "你的备注：{note}",
  "answered":
    "已作答",
  "working":
    "处理中",
  "The desk stopped partway.":
    "委员会中途停止了。",
  "The desk":
    "委员会",
  "that it closes higher":
    "认为它会收高",
  "{p}% before review":
    "互评前 {p}%",
  "members {spread} points apart":
    "成员之间相差 {spread} 个百分点",
  "Dissent: the {title} at {p}%":
    "异议：{title}，{p}%",
  "The chair's memo":
    "主席备忘录",
  "Settles on Hyperliquid's one-minute close.":
    "按 Hyperliquid 的一分钟收盘价结算。",
  "Settles in {time} on Hyperliquid's one-minute close.":
    "{time} 后按 Hyperliquid 的一分钟收盘价结算。",
  "Void: Hyperliquid had no price for that minute, so it does not count.":
    "作废：Hyperliquid 在那一分钟没有价格，因此不计入。",
  "Closed at {price}: higher. Every forecast in this run is now scored.":
    "收于 {price}：走高。本次会议的每个预测现已计分。",
  "Closed at {price}: not higher. Every forecast in this run is now scored.":
    "收于 {price}：未走高。本次会议的每个预测现已计分。",
  "The members":
    "成员",
  "The fact sheet every member read":
    "每位成员阅读的事实表",
  "Scoreboard":
    "记分板",
  "Brier score: the squared distance between a forecast and what happened. 0 is perfect; always saying 50% scores 0.250. Lower is better. It counts every settled call, across everyone who has convened the desk.":
    "Brier 分数：预测与实际结果之差的平方。0 为完美；始终给出 50% 的得分为 0.250。越低越好。它统计所有召集过委员会的人的每一次已结算预测。",
  "Nothing has settled yet. Each call is scored when its time comes, and the board fills in.":
    "尚无结算。每个预测会在到期时计分，记分板随之填充。",
  "The desk is beating its best member: {desk} against {best}.":
    "委员会领先其最佳成员：{desk} 对 {best}。",
  "The best member, the {title}, is ahead of the desk: {best} against {desk}.":
    "最佳成员“{title}”领先委员会：{best} 对 {desk}。",
  "The review round is helping.":
    "互评环节在起作用。",
  "So far the review round is not helping.":
    "目前互评环节没有起作用。",
  "Always saying 50%":
    "始终给出 50%",
  "One fact sheet, built by code from Hyperliquid, for every member. A member that cites a number not on it is flagged and its reasoning withheld.":
    "由代码根据 Hyperliquid 数据生成一份事实表，所有成员共用。引用表外数字的成员会被标记，其推理不予展示。",
  "The chair gives each member an assignment through its lens, so the work is divided, not repeated.":
    "主席按每位成员的视角分配任务，让工作分工而不是重复。",
  "Independent views first, in parallel: nobody sees anyone else's, so nobody anchors on the loudest voice.":
    "先并行给出独立观点：谁也看不到别人的观点，因此没人会被最响亮的声音带偏。",
  "One review round on anonymised views — Member A, Member B — so an argument is weighed on its merits, not its lab.":
    "对匿名观点（成员 A、成员 B）进行一轮互评，让论点凭其本身而不是所属实验室被衡量。",
  "The vote is pooled by code, weighted by each seat's measured accuracy. No model can overrule the arithmetic.":
    "投票由代码汇总，按每个席位的实测准确度加权。任何模型都无法推翻这一计算。",
  "The chair writes the memo and must give the dissent its strongest form.":
    "主席撰写备忘录，并且必须以最有力的形式呈现异议。",
  "Every forecast is scored when the market settles it, and the scoreboard shows whether the committee beats its best member.":
    "每个预测都在市场结算时计分，记分板显示委员会是否胜过其最佳成员。",
  "Who sits at the desk":
    "委员会成员",
  "does not vote":
    "不投票",
  "free tier":
    "免费额度",
  "paid tier":
    "付费版",
  "Empty on this deployment":
    "本部署未配置",
  "How the desk works":
    "委员会如何运作",
  "Sign in to convene the desk":
    "登录后召集委员会",
  "A committee of AI models from different labs forecasts one market question together and is scored on it. Words only — it never trades.":
    "由不同实验室的 AI 模型组成的委员会共同预测一个市场问题，并据此计分。只输出文字——从不交易。",
  "The desk is unavailable":
    "委员会暂不可用",
  "Never trades":
    "从不交易",
  "Earlier sessions":
    "以往会议",
  "Stopped":
    "已中止",
  "In session":
    "开会中",
  "higher":
    "走高",
  "not higher":
    "未走高",
  "4 hours":
    "4 小时",
  "Chair":
    "主席",
  "Runs the process: sets each member's assignment, keeps the record, and writes the memo with the dissent in it. Does not vote.":
    "主持流程：为每位成员分配任务、保存记录，并撰写包含异议的备忘录。不投票。",
  "Strategist":
    "策略师",
  "The bigger picture: the regime the market is in and what the price already assumes.":
    "大局：市场所处的阶段，以及价格已经反映了什么。",
  "Market structure":
    "市场结构",
  "The chart: trend against the averages, where the price sits in its range, and how far it usually moves.":
    "图表：相对均线的趋势、价格在区间中的位置，以及它通常的波动幅度。",
  "Risk officer":
    "风险官",
  "The red team: the strongest case against the obvious read, and what would break it.":
    "红队：针对显而易见判断的最有力反方论证，以及什么会推翻它。",
  "Who is crowded: funding, open interest and volume, and which side pays to stay in.":
    "谁更拥挤：资金费率、未平仓量和成交量，以及哪一方在付费维持仓位。",
  "Cross-market":
    "跨市场",
  "How this market sits against Bitcoin and Ether over the same windows.":
    "在相同时间窗口内，该市场相对比特币和以太坊的表现。",
  "Quant":
    "量化",
  "Base rates: how often this market has risen over windows like this one, and how big a typical move is.":
    "基准概率：在类似的时间窗口内该市场上涨的频率，以及典型波动有多大。",
  "Contrarian":
    "逆向者",
  "Argue the side the room is likely to miss, then give your honest probability anyway.":
    "论证众人可能忽略的一方，然后依然给出你真实的概率。",
  "Second opinion":
    "第二意见",
  "An independent read of the whole sheet, as if no one else were in the room.":
    "对整张事实表的独立解读，就像房间里没有其他人一样。",
  "Generalist":
    "通才",
  "A generalist's read: the plainest explanation of the facts.":
    "通才的解读：对事实最直白的解释。",
  "The desk's summary":
    "委员会摘要",
  "The desk puts {p}% on this.":
    "委员会给出的概率为 {p}%。",
  "1 member voted, at {p}%.":
    "1 位成员投票，给出 {p}%。",
  "{count} members voted, from {low}% to {high}%.":
    "{count} 位成员投票，区间为 {low}% 至 {high}%。",
  "The dissent came from the {title} at {p}%.":
    "异议来自{title}，给出 {p}%。",
  "Withheld: it cited a figure that is not on the fact sheet.":
    "已隐藏：它引用了事实表之外的数字。",
  "No answer (rate limited).":
    "未作答（请求受限）。",
  "No answer (server error).":
    "未作答（服务器错误）。",
  "No answer (network).":
    "未作答（网络问题）。",
  "No answer (timeout).":
    "未作答（超时）。",
  "No answer (bad request).":
    "未作答（请求无效）。",
  "No answer (auth).":
    "未作答（认证失败）。",
  "No answer (malformed response).":
    "未作答（返回格式有误）。",
  "No answer (failed).":
    "未作答（失败）。",
  "Declined to answer.":
    "拒绝作答。",
  "Its answer could not be read.":
    "无法读取其回答。",
  "Its answer was cut off before it finished.":
    "其回答在完成前被截断。",
  "Too few members answered to hold a vote.":
    "作答的成员太少，无法投票。",
  "The desk stopped partway. Nothing was lost but this run.":
    "委员会中途停止了。除本次会议外，没有任何损失。",
  "The desk ran out of time on this one.":
    "委员会这次超时了。",
  "Market: {label}, a Hyperliquid perpetual":
    "市场：{label}，Hyperliquid 永续合约",
  "Price now (mid): {price}":
    "当前价格（中间价）：{price}",
  "Change over the last 24 hours: {change}":
    "过去 24 小时涨跌：{change}",
  "Change over the last 7 days: {change}":
    "过去 7 天涨跌：{change}",
  "Change over the last {days} days: {change}":
    "过去 {days} 天涨跌：{change}",
  "7-day range: low {low}, high {high}":
    "7 天区间：最低 {low}，最高 {high}",
  "Where the price sits in that range: {share}% of the way from low to high":
    "价格在该区间中的位置：从最低到最高的 {share}% 处",
  "20-day average close: {average}; the price is {change} from it":
    "20 日平均收盘价：{average}；当前价格相对其 {change}",
  "Daily volatility (standard deviation of daily moves, last {days} days): {volatility}%":
    "日波动率（过去 {days} 天每日涨跌的标准差）：{volatility}%",
  "A typical move over the question's horizon (one standard deviation): {move}%":
    "问题时间范围内的典型波动（一个标准差）：{move}%",
  "Days that closed higher than they opened, last {days} days: {up} of {days}":
    "过去 {days} 天中收盘高于开盘的天数：{days} 天中有 {up} 天",
  "Hours that closed higher than they opened, last 24 hours: {up} of 24":
    "过去 24 小时中收盘高于开盘的小时数：24 小时中有 {up} 小时",
  "Bitcoin: {day} over 24 hours, {week} over 7 days":
    "比特币：24 小时 {day}，7 天 {week}",
  "Bitcoin: {day} over 24 hours":
    "比特币：24 小时 {day}",
  "Bitcoin: {week} over 7 days":
    "比特币：7 天 {week}",
  "Ether: {day} over 24 hours, {week} over 7 days":
    "以太坊：24 小时 {day}，7 天 {week}",
  "Ether: {day} over 24 hours":
    "以太坊：24 小时 {day}",
  "Ether: {week} over 7 days":
    "以太坊：7 天 {week}",
  "Hyperliquid's bars could not be read just now; the sheet has no history.":
    "暂时无法读取 Hyperliquid 的 K 线；事实表没有历史数据。",
  "Funding: {hourly}% an hour, about {annual}% a year; longs pay shorts":
    "资金费率：每小时 {hourly}%，约合每年 {annual}%；多头向空头支付",
  "Funding: {hourly}% an hour, about {annual}% a year; shorts pay longs":
    "资金费率：每小时 {hourly}%，约合每年 {annual}%；空头向多头支付",
  "Funding: {hourly}% an hour, about {annual}% a year; nobody pays":
    "资金费率：每小时 {hourly}%，约合每年 {annual}%；双方均不支付",
  "Open interest: ${millions} million":
    "未平仓量：{millions} 百万美元",
  "Volume over 24 hours: ${millions} million":
    "24 小时成交量：{millions} 百万美元",
  "Funding and open interest could not be read just now.":
    "暂时无法读取资金费率和未平仓量。",
  "Funding and open interest are not on the sheet: this market trades on trade[XYZ], a builder exchange on Hyperliquid.":
    "事实表不含资金费率和未平仓量：该市场在 trade[XYZ] 上交易，这是 Hyperliquid 上的一个构建者交易所。",
};
