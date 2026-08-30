import type { ChatMessage, ToolCall } from "@/lib/types";
import { ago } from "@/lib/format";

/** The thread the operator returns to. */
export const CHAT_SEED: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    text: "Why is my SOL perp still open? Funding was supposed to close part of it.",
    at: ago(21 * 60),
  },
  {
    id: "msg-2",
    role: "agent",
    text: "The funding drain guard ran 18 minutes ago and held. Funding on SOL-PERP is +0.0092% per 8h — positive, so the rule's condition of a sustained reading below -0.01% was never met. The position is unchanged at 124.6 SOL long from $176.84.",
    at: ago(20 * 60),
    toolCall: {
      id: "tool-1",
      label: "Read SOL funding history",
      columns: ["Time (UTC)", "Funding", "Open interest", "Mark"],
      rows: [
        ["14:00", "+0.0092%", "$412.8M", "$184.26"],
        ["06:00", "+0.0074%", "$408.1M", "$181.92"],
        ["22:00", "+0.0031%", "$396.4M", "$179.44"],
        ["14:00", "-0.0018%", "$389.7M", "$177.10"],
        ["06:00", "-0.0044%", "$384.2M", "$176.02"],
      ],
      note: "Last reading below -0.01% was 3 days ago at 22:00 UTC.",
    },
  },
  {
    id: "msg-3",
    role: "user",
    text: "And the DOGE leg?",
    at: ago(12 * 60),
  },
  {
    id: "msg-4",
    role: "agent",
    text: "DOGE-PERP is 26.98% down — 48,000 long from $0.1946, marked at $0.1841, liquidation at $0.1482. The drawdown stop triggered two hours ago and queued a full close; it is waiting on your confirmation, so nothing has been sold. Book depth below $0.1800 also thinned 34% overnight.",
    at: ago(11 * 60),
    toolCall: {
      id: "tool-2",
      label: "Read DOGE book depth, 02:00–06:00 UTC",
      columns: ["Window", "Bid depth ±2%", "Ask depth ±2%", "Change"],
      rows: [
        ["02:00", "$8.4M", "$7.9M", "—"],
        ["03:00", "$7.6M", "$7.8M", "-9.5%"],
        ["04:00", "$6.4M", "$7.7M", "-15.8%"],
        ["05:00", "$5.8M", "$7.6M", "-9.4%"],
        ["06:00", "$5.5M", "$7.5M", "-5.2%"],
      ],
      note: "Depth has not been replaced in the eight hours since.",
    },
  },
];

/** Three chips above the composer, seeded from whatever symbol is selected. */
export function suggestionChips(symbol: string): string[] {
  return [
    `Why is ${symbol} moving?`,
    `Show my ${symbol} exposure`,
    `What would close ${symbol} cost?`,
  ];
}

/** Pre-filled question when a signal card's "Ask Elyra" is used. */
export function signalPrompt(symbol: string, thesis: string): string {
  return `About the ${symbol} signal — "${thesis}" What is the evidence behind it?`;
}

type MockReply = { text: string; toolCall?: ToolCall };

function fundingTool(symbol: string): ToolCall {
  return {
    id: `tool-funding-${symbol}`,
    label: `Read ${symbol} funding history`,
    columns: ["Time (UTC)", "Funding", "Open interest"],
    rows: [
      ["14:00", "+0.0092%", "$412.8M"],
      ["06:00", "+0.0074%", "$408.1M"],
      ["22:00", "+0.0031%", "$396.4M"],
    ],
    note: "Three most recent settlement windows.",
  };
}

function exposureTool(symbol: string): ToolCall {
  return {
    id: `tool-exposure-${symbol}`,
    label: `Read ${symbol} exposure across venues`,
    columns: ["Venue", "Side", "Size", "Notional"],
    rows: [
      ["Perps", "Long", "124.60", "$22,958.80"],
      ["Spot", "Long", "86.40", "$15,914.88"],
      ["LP · Orca", "Long", "61.80", "$11,383.56"],
    ],
    note: "Net long across three venues.",
  };
}

/**
 * Mocked reply selection. Deterministic on the question, so the same input
 * always produces the same answer — a real backend replaces this function.
 */
export function mockReply(question: string, symbol: string): MockReply {
  const q = question.toLowerCase();

  if (q.includes("funding")) {
    return {
      text: `Funding on ${symbol} is positive at +0.0092% per 8h, so longs are paying. It has printed positive on the last three settlements while open interest rose 4.2%. That combination means the move is being carried by leverage, which is worth knowing before adding to it.`,
      toolCall: fundingTool(symbol),
    };
  }

  if (q.includes("exposure") || q.includes("position") || q.includes("size")) {
    return {
      text: `You hold ${symbol} in three places: 124.6 on perps, 86.4 spot, and 61.8 in the Orca LP range. Net notional is $50,257.24, which is 38% of account equity. The perp leg carries the liquidation risk — it sits at $142.18.`,
      toolCall: exposureTool(symbol),
    };
  }

  if (q.includes("close") || q.includes("cost") || q.includes("exit")) {
    return {
      text: `Closing the ${symbol} perp leg at market would cross roughly 0.14% of book depth — about $32 of slippage on 124.6 units, plus $16.24 in taker fees. Realised PnL on the close would be $924.53. The spot and LP legs are unaffected.`,
    };
  }

  if (q.includes("why") || q.includes("moving") || q.includes("move")) {
    return {
      text: `${symbol} is up 2.41% over 24h and reclaimed the 4H range high at 181.40 earlier today. Spot volume on the reclaim ran 1.7× its 20-period average while perp open interest stayed flat, so spot led it. That is an observation about what happened, not a read on what happens next — invalidation is a 4H close back under 178.05.`,
    };
  }

  if (q.includes("signal") || q.includes("evidence")) {
    return {
      text: `The ${symbol} signal rests on three closes above a level that capped price since Tuesday, on volume 1.7× the 20-period average, with open interest flat. Confidence is 0.72 because the volume and the flat open interest agree; it is not higher because the sample of comparable reclaims this quarter is eleven, and three of those failed within two sessions.`,
      toolCall: {
        id: `tool-signal-${symbol}`,
        label: `Read ${symbol} range reclaims this quarter`,
        columns: ["Date", "Reclaim level", "Held 2 sessions", "Move"],
        rows: [
          ["12 Aug", "$168.40", "Yes", "+11.2%"],
          ["29 Jul", "$174.10", "No", "-6.4%"],
          ["16 Jul", "$159.80", "Yes", "+8.7%"],
          ["02 Jul", "$151.20", "No", "-4.1%"],
        ],
        note: "Eleven reclaims this quarter; four shown.",
      },
    };
  }

  if (q.includes("rule") || q.includes("automation")) {
    return {
      text: `Six rules are armed and two are paused. The one touching ${symbol} is the funding drain guard: it closes 25% of the perp if funding stays below -0.01% for 30 minutes. It last ran 18 minutes ago and held, because funding is currently positive.`,
    };
  }

  return {
    text: `I can read your ${symbol} positions, order book depth, funding history and rule state. Ask about any of those and I will show the data I used. I do not place orders on my own — rules do that, and only the ones you have armed.`,
  };
}
