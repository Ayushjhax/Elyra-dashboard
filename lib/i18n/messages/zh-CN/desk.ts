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
  "Will it be true? {statement}.":
    "这会成立吗？{statement}。",
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
};
