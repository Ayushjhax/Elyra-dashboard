import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  groupChatRefusal,
  renderAnswerForTelegram,
} from "@/lib/personalized/render/telegram";
import { inferProposal } from "@/lib/personalized/proposal";
import type { PersonalizedAnswer } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   The Telegram renderer and the shared action parser.

   These are the two pieces that make Telegram a CHANNEL rather than a second
   product: one structure rendered two ways, and one intent parser used by
   both. A bug in either reintroduces the split — a preview showing different
   numbers in chat than on the dashboard, or a group chat leaking a balance.
--------------------------------------------------------------------------- */

const ANSWER: PersonalizedAnswer = {
  headline: "SOL is your largest exposure",
  message: "SOL is 34% of equity and down 5% today.",
  metrics: [{ label: "Equity", value: "$24,581.42", delta: "-1.77%", tone: "negative" }],
  insights: [
    { type: "risk", title: "Above your limit", detail: "You saved a 30% cap." },
  ],
  suggestedPrompts: ["How do I reduce it?", "What changed since yesterday?"],
  contextUsed: ["equity", "allocation"],
};

describe("escapeHtml", () => {
  it("escapes the characters Telegram treats as markup", () => {
    /* A token literally named <b> exists. Unescaped it either breaks the
       parse — Telegram rejects the whole message and the user sees nothing —
       or injects formatting into a financial figure. */
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("renderAnswerForTelegram", () => {
  it("renders headline, message, metrics and insights", () => {
    const { text } = renderAnswerForTelegram(ANSWER);
    expect(text).toContain("<b>SOL is your largest exposure</b>");
    expect(text).toContain("SOL is 34% of equity");
    expect(text).toContain("<b>$24,581.42</b>");
    expect(text).toContain("Above your limit");
  });

  it("returns suggestions separately rather than inline", () => {
    const { suggestions } = renderAnswerForTelegram(ANSWER);
    expect(suggestions).toEqual(["How do I reduce it?", "What changed since yesterday?"]);
  });

  it("escapes model output, which is untrusted text", () => {
    const { text } = renderAnswerForTelegram({ message: "<script>alert(1)</script>" });
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
  });

  it("truncates rather than letting Telegram reject the message", () => {
    /* Over 4096 characters Telegram refuses the send outright, so an
       un-truncated long answer is an answer the user never sees. */
    const { text } = renderAnswerForTelegram({ message: "x".repeat(10_000) });
    expect(text.length).toBeLessThan(4_096);
    expect(text).toContain("Truncated");
  });

  it("always states why a prepared action cannot execute", () => {
    const { text } = renderAnswerForTelegram({
      message: "Here is the swap.",
      preparedAction: {
        id: "a1",
        kind: "swap",
        summary: "Swap 21.25 SOL to USDC",
        fields: [{ label: "Amount", value: "21.25 SOL", derived: true }],
        readiness: "unsupported",
        reason: "No swap route is connected yet.",
        warnings: [],
        preparedAt: "2026-09-16T00:00:00.000Z",
      },
    });
    expect(text).toContain("Swap 21.25 SOL to USDC");
    /* A preview that looks executable and is not is worse than no preview. */
    expect(text).toContain("No swap route is connected yet.");
  });

  it("surfaces a ready action as still needing confirmation", () => {
    const { text } = renderAnswerForTelegram({
      message: "ok",
      preparedAction: {
        id: "a2",
        kind: "swap",
        summary: "Swap 1 SOL",
        fields: [],
        readiness: "ready",
        reason: null,
        warnings: [],
        preparedAt: "2026-09-16T00:00:00.000Z",
      },
    });
    /* Chat prepares; it never executes. */
    expect(text).toMatch(/nothing has been sent/i);
  });
});

describe("group chat refusal", () => {
  it("names no figure and confirms nothing about the account", () => {
    const text = groupChatRefusal();
    expect(text).toMatch(/private chat/i);
    expect(text).not.toMatch(/\$|equity|balance:/i);
  });
});

describe("inferProposal — shared by both channels", () => {
  it("reads a fraction out of plain language", () => {
    expect(inferProposal("sell half my SOL", ["SOL"])).toMatchObject({
      kind: "swap",
      symbol: "SOL",
      fraction: 0.5,
    });
  });

  it("reads a percentage", () => {
    expect(inferProposal("reduce my SOL perp by 25%", ["SOL"])).toMatchObject({
      kind: "reduce_perp",
      fraction: 0.25,
    });
  });

  it("recognises closing a position without a named market", () => {
    /* "my riskiest perp" names nothing — the server picks by liquidation
       proximity, which is computed rather than a model opinion. */
    expect(inferProposal("close my riskiest perp", [])).toMatchObject({
      kind: "close_perp",
    });
  });

  it("returns null for anything it does not confidently recognise", () => {
    /* The correct failure for something that moves money: no preview. */
    expect(inferProposal("what is my portfolio worth", ["SOL"])).toBeNull();
    expect(inferProposal("hello", [])).toBeNull();
  });

  it("never invents a symbol that was not named", () => {
    expect(inferProposal("send some tokens somewhere", [])).toBeNull();
  });

  it("gives both channels the identical proposal for identical input", () => {
    /* The whole reason this module was extracted: two copies would drift,
       and the drift would be a preview that differs between chat and web. */
    const a = inferProposal("swap 100 USDC to SOL", ["USDC", "SOL"]);
    const b = inferProposal("swap 100 USDC to SOL", ["USDC", "SOL"]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ kind: "swap", symbol: "USDC", toSymbol: "SOL" });
  });
});
