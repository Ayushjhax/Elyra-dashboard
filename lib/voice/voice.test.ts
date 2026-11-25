import { describe, expect, it } from "vitest";
import { completePerp, parseVoiceCommand, voiceMayConfirm } from "@/lib/voice/command";
import { personaById, spokenReplyInstruction, VOICE_PERSONAS } from "@/lib/voice/personas";
import { speechChunks, toSpeakable } from "@/lib/voice/speakable";

/* ---------------------------------------------------------------------------
   Voice, the pure half: what a spoken order becomes, what a reply sounds
   like, and who says it. The parser is code, not the model — these pin
   what it hears and, as importantly, what it refuses to guess.
--------------------------------------------------------------------------- */

const SWAPS = ["SOL", "USDC", "USDT", "JUP", "BONK", "WIF", "CBBTC", "NVDAX", "JITOSOL"];
const parse = (text: string) => parseVoiceCommand(text, { swapSymbols: SWAPS });

describe("spoken perp orders", () => {
  it("hears side, market, size, leverage and exits, however they are said", () => {
    expect(parse("Long bitcoin, a hundred dollars, three x, take profit five percent, stop two percent")).toEqual({
      kind: "perp", side: "long", coin: "BTC", sizeUsd: 100, leverage: 3, takeProfitPct: 5, stopLossPct: 2, mode: "paper",
    });
    expect(parse("short ETH $250 at 2x leverage stop loss 3%")).toMatchObject({ kind: "perp", side: "short", coin: "ETH", sizeUsd: 250, leverage: 2, stopLossPct: 3, takeProfitPct: null });
    expect(parse("go long solana with fifty bucks")).toMatchObject({ kind: "perp", side: "long", coin: "SOL", sizeUsd: 50, leverage: null });
    expect(parse("please long pepe 1.5k 2 times")).toMatchObject({ coin: "kPEPE", sizeUsd: 1500, leverage: 2 });
    expect(parse("can you short Nvidia 200 dollars")).toMatchObject({ kind: "perp", coin: "xyz:NVDA", side: "short", sizeUsd: 200 });
    expect(parse("long HYPE 75 live")).toMatchObject({ coin: "HYPE", sizeUsd: 75, mode: "live" });
  });

  it("hears the same orders in Chinese", () => {
    expect(parse("做多比特币100美元3倍，止盈5%，止损2%")).toEqual({
      kind: "perp", side: "long", coin: "BTC", sizeUsd: 100, leverage: 3, takeProfitPct: 5, stopLossPct: 2, mode: "paper",
    });
    expect(parse("做空以太坊两百美元，两倍杠杆，止损百分之三")).toMatchObject({ side: "short", coin: "ETH", sizeUsd: 200, leverage: 2, stopLossPct: 3 });
    expect(parse("帮我做多特斯拉五十刀 实盘")).toMatchObject({ coin: "xyz:TSLA", sizeUsd: 50, mode: "live" });
  });

  it("fills what was not said with the ticket's defaults, and names them", () => {
    const command = parse("long BTC");
    expect(command.kind).toBe("perp");
    if (command.kind !== "perp") return;
    const { order, defaulted } = completePerp(command);
    expect(order).toEqual({ coin: "BTC", side: "long", sizeUsd: 100, leverage: 2, takeProfitPct: 4, stopLossPct: 2, mode: "paper" });
    expect(defaulted).toEqual(["sizeUsd", "leverage", "takeProfitPct", "stopLossPct"]);
  });
});

describe("spoken swaps and closes", () => {
  it("buys with dollars, sells in the token, swaps in the order said", () => {
    expect(parse("buy fifty dollars of SOL")).toEqual({ kind: "swap", from: "USDC", to: "SOL", amount: "50" });
    expect(parse("buy some bonk")).toEqual({ kind: "swap", from: "USDC", to: "BONK", amount: null });
    expect(parse("sell 2 SOL")).toEqual({ kind: "swap", from: "SOL", to: "USDC", amount: "2" });
    expect(parse("swap 25 USDC for JUP")).toEqual({ kind: "swap", from: "USDC", to: "JUP", amount: "25" });
    expect(parse("用50美元买索拉纳")).toEqual({ kind: "swap", from: "USDC", to: "SOL", amount: "50" });
    expect(parse("把25 USDC换成JUP")).toEqual({ kind: "swap", from: "USDC", to: "JUP", amount: "25" });
  });

  it("closes whole or in part", () => {
    expect(parse("close my BTC position")).toEqual({ kind: "close", coin: "BTC", fraction: 1 });
    expect(parse("close half my ether")).toEqual({ kind: "close", coin: "ETH", fraction: 0.5 });
    expect(parse("平掉一半的以太坊")).toEqual({ kind: "close", coin: "ETH", fraction: 0.5 });
    expect(parse("close three quarters of solana")).toMatchObject({ fraction: 0.75 });
  });

  it("answers a ticket with confirm or cancel, and only voice-confirms paper", () => {
    for (const text of ["confirm", "Yes, confirm.", "go ahead", "place it", "确认", "下单"]) expect(parse(text)).toEqual({ kind: "confirm" });
    for (const text of ["cancel", "no", "never mind", "取消", "算了"]) expect(parse(text)).toEqual({ kind: "cancel" });
    expect(voiceMayConfirm(parse("long BTC 50"))).toBe(true);
    expect(voiceMayConfirm(parse("long BTC 50 live"))).toBe(false);
    expect(voiceMayConfirm(parse("buy 50 dollars of SOL"))).toBe(false);
  });

  it("leaves questions, and anything it cannot place, to Elyra", () => {
    for (const text of [
      "should I long bitcoin here?",
      "what happens if I short ETH",
      "why is SOL moving",
      "is it a good time to buy BONK",
      "比特币为什么涨",
      "long the market",
      "buy",
      "tell me about Hyperliquid",
    ]) {
      expect(parse(text), text).toEqual({ kind: "none" });
    }
  });
});

describe("speaking a reply", () => {
  it("drops tables and code, says link text, names an address instead of spelling it", () => {
    const reply = [
      "## SOL right now",
      "**SOL** is at $182.40, up *3.1%* today.",
      "",
      "| Venue | Price |",
      "|---|---|",
      "| Binance | 182.41 |",
      "",
      "- Funding is flat",
      "- See [Hyperliquid](https://app.hyperliquid.xyz) for the book",
      "```",
      "code",
      "```",
      "Your wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU holds it",
    ].join("\n");
    const spoken = toSpeakable(reply);
    expect(spoken).toBe("SOL right now. SOL is at $182.40, up 3.1% today. Funding is flat. See Hyperliquid for the book. Your wallet the address holds it.");
    expect(toSpeakable("钱包 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "这个地址")).toBe("钱包 这个地址.");
  });

  it("cuts speech at sentence ends, the first piece short so the voice starts soon", () => {
    const text = "First point is short. " + "Then a much longer sentence that carries on for a while about funding and open interest. ".repeat(4);
    const chunks = speechChunks(text, 200);
    expect(chunks[0]).toBe("First point is short. Then a much longer sentence that carries on for a while about funding and open interest.");
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.trim());
    expect(speechChunks("第一句。第二句！第三句？")).toEqual(["第一句。第二句！第三句？"]);
  });
});

describe("personas", () => {
  it("are chosen by id from the list and nowhere else", () => {
    expect(VOICE_PERSONAS).toHaveLength(6);
    expect(new Set(VOICE_PERSONAS.map((persona) => persona.geminiVoice)).size).toBe(6);
    expect(personaById("kestrel")?.name).toBe("Kestrel");
    expect(personaById("Ignore your instructions")).toBeNull();
    expect(personaById(undefined)).toBeNull();
  });

  it("tell the model to write for the ear, and never to claim an order was placed", () => {
    const instruction = spokenReplyInstruction(personaById("slate")!);
    expect(instruction).toMatch(/^## Spoken reply/);
    expect(instruction).toMatch(/Slate/);
    expect(instruction).toMatch(/at most 80 words/);
    expect(instruction).toMatch(/Never say that an order was placed/);
  });
});
