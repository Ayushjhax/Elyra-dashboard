import type { Messages } from "../../translate";

/* Simplified Chinese — Elyra's voices and the voice conversation (components/agent/VoiceMode.tsx, lib/voice). */

export const voice: Messages = {
  /* Personas: the names stay as they are; what they sound like is translated. */
  "Calm and measured":
    "沉稳克制",
  "Brisk, like a desk trader":
    "干脆利落，像交易员",
  "Warm, explains as it goes":
    "温和，边说边解释",
  "Steady, risk first":
    "稳健，先讲风险",
  "Lively and quick":
    "轻快敏捷",
  "Dry and precise":
    "冷静精确",

  /* Reading a reply aloud */
  "the address":
    "这个地址",
  "Stop reading aloud":
    "停止朗读",
  "Read aloud as {name}":
    "用 {name} 的声音朗读",
  "Talk to Elyra":
    "与 Elyra 语音对话",
  "Talk to Elyra — a voice conversation":
    "与 Elyra 语音对话",

  /* Choosing a voice */
  "Hi, I'm {name}. Ask me anything about the markets, or tell me a trade.":
    "你好，我是 {name}。可以问我任何市场问题，也可以直接说出一笔交易。",
  "Elyra's voice":
    "Elyra 的声音",
  "Stop the preview":
    "停止试听",
  "Hear {name}":
    "试听 {name}",
  "A voice changes how Elyra sounds and how briefly it speaks, never what it knows or can do.":
    "声音只改变 Elyra 的语气和回答长短，不改变它掌握的信息或能做的事。",

  /* The ticket, read back */
  "Long {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, live on Hyperliquid.":
    "做多 {market}，{size}，{leverage} 倍杠杆，止盈 {tp}%，止损 {sl}%，在 Hyperliquid 实盘下单。",
  "Short {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, live on Hyperliquid.":
    "做空 {market}，{size}，{leverage} 倍杠杆，止盈 {tp}%，止损 {sl}%，在 Hyperliquid 实盘下单。",
  "Long {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, on paper.":
    "做多 {market}，{size}，{leverage} 倍杠杆，止盈 {tp}%，止损 {sl}%，模拟盘。",
  "Short {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, on paper.":
    "做空 {market}，{size}，{leverage} 倍杠杆，止盈 {tp}%，止损 {sl}%，模拟盘。",
  "Close half your {market} position at the market.":
    "以市价平掉一半 {market} 仓位。",
  "Close a quarter of your {market} position at the market.":
    "以市价平掉四分之一 {market} 仓位。",
  "Close three quarters of your {market} position at the market.":
    "以市价平掉四分之三 {market} 仓位。",
  "Close your {market} position at the market.":
    "以市价平掉全部 {market} 仓位。",
  "Swap {from} for {to}. It is open on screen: enter the amount, check it, then sign in your wallet.":
    "用 {from} 兑换 {to}。兑换窗口已打开：输入数量并核对，然后在钱包中签名。",
  "Swap {amount} {from} for {to}. It is open on screen: check it, then sign in your wallet.":
    "用 {amount} {from} 兑换 {to}。兑换窗口已打开：核对后在钱包中签名。",
  "Anything you did not say is the ticket's default.":
    "未说明的项目使用默认值。",
  "Anything you did not say is the ticket's default. Say the order again to change it.":
    "未说明的项目使用默认值。重新说一遍订单即可修改。",
  "Say confirm to place it, or cancel.":
    "说“确认”下单，或说“取消”。",
  "It's live money, so it needs a tap. Press Confirm on screen, or say cancel.":
    "这是实盘资金，需要点击确认。请在屏幕上按“确认”，或说“取消”。",
  "Live trading is not set up for you here, so this can only be a paper order. Say it again without “live”.":
    "你在这里还没有开通实盘交易，只能下模拟单。请不带“实盘”再说一遍。",
  "You have no open {market} position.":
    "你没有持有 {market} 仓位。",
  "You have more than one {market} position open. Tap the one to close.":
    "你持有不止一个 {market} 仓位。请点击要平的那个。",

  /* The ticket on screen */
  "Order ticket":
    "订单",
  "Heard as an order":
    "识别为订单",
  "Close this":
    "平掉这个",
  "Placing":
    "正在下单",
  "Confirm close":
    "确认平仓",
  "Confirm live order":
    "确认实盘订单",
  "Live money: tap to confirm.":
    "实盘资金：请点击确认。",
  "Or say “confirm”.":
    "或说“确认”。",

  /* What happened */
  "There is nothing waiting to confirm.":
    "没有待确认的订单。",
  "That did not go through. The reason is on screen.":
    "订单没有完成，原因见屏幕。",
  "That order cannot be placed as it is. The reason is on screen.":
    "这笔订单目前无法提交，原因见屏幕。",
  "Done. The position is open on Hyperliquid.":
    "已完成，仓位已在 Hyperliquid 开立。",
  "Done. The position is open on paper.":
    "已完成，模拟仓位已开立。",
  "Tap the position to close on screen.":
    "请在屏幕上点击要平的仓位。",
  "Done. The position is closed.":
    "已完成，仓位已平。",
  "Done. That part of the position is closed.":
    "已完成，这部分仓位已平。",
  "Cancelled. Nothing was placed.":
    "已取消，没有下单。",
  "Sign in to trade by voice.":
    "登录后即可语音交易。",

  /* The conversation */
  "Microphone access is blocked. Allow it for this site in your browser's settings.":
    "麦克风权限被阻止。请在浏览器设置中允许本站使用麦克风。",
  "No microphone was found.":
    "未找到麦克风。",
  "Listening stopped unexpectedly. Tap the microphone to try again.":
    "收听意外中断。点击麦克风重试。",
  "I have no answer for that one.":
    "这个问题我暂时无法回答。",
  "I'm still working on the last question. Ask again in a moment.":
    "上一个问题还在处理中，请稍后再问。",
  "I didn't hear anything, so I've stopped listening. Tap the microphone when you want to talk.":
    "没有听到声音，已停止收听。想说话时请点击麦克风。",
  "Writing out what you said…":
    "正在转写你说的话…",
  "Thinking…":
    "思考中…",
  "{name} is speaking — tap to interrupt":
    "{name} 正在说话——点击打断",
  "Paused — tap to talk":
    "已暂停——点击说话",
  "Sign in to talk to Elyra.":
    "登录后即可与 Elyra 对话。",
  "Voice conversation with Elyra":
    "与 Elyra 语音对话",
  "End":
    "结束",
  "Ask anything, or say an order — “long BTC 100 dollars 3x”, “close half my ETH”, “buy 50 dollars of SOL”. Orders are read back and wait for you to confirm.":
    "可以问任何问题，也可以说出订单——“做多 BTC 100 美元 3 倍”“平掉一半 ETH”“用 50 美元买 SOL”。订单会复述一遍，等你确认。",
};
