import { describe, expect, it } from "vitest";
import { analysisFollowUps, analysisSubject } from "@/lib/agent/followUps";
import { parseShortcut } from "@/lib/agent/shortcuts";
import { matchingShortcuts } from "@/lib/agent/shortcuts";
import { webShortcut, webShortcutMenu } from "@/lib/agent/webShortcuts";

const MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

describe("analysis shortcuts", () => {
  it("turns each command into the question the agent answers", () => {
    expect(parseShortcut("/analyze SOL")).toMatchObject({ kind: "ask", prompt: expect.stringMatching(/^Analyze SOL right now: price and market data, security/) });
    expect(parseShortcut("/research SOL")).toMatchObject({ kind: "ask", prompt: expect.stringMatching(/^Research SOL: /) });
    expect(parseShortcut(`/safe ${MINT}`)).toEqual({ kind: "ask", prompt: `Is this token safe? ${MINT}` });
    expect(parseShortcut("/sentiment BTC")).toEqual({ kind: "ask", prompt: "What's the market sentiment for BTC?" });
    expect(parseShortcut("/compare ETH vs SOL")).toEqual({ kind: "ask", prompt: "Compare ETH and SOL." });
    expect(parseShortcut("/macro")).toMatchObject({ kind: "ask", prompt: expect.stringMatching(/S&P 500, Nasdaq, Dow, VIX/) });
    expect(parseShortcut("/deep BONK")).toEqual({ kind: "ask", prompt: "Give me deep research on BONK." });
  });

  it("asks for the list when a command needs a token and has none", () => {
    expect(parseShortcut("/safe")).toEqual({ kind: "help" });
    expect(parseShortcut("/compare ETH")).toEqual({ kind: "help" });
    expect(parseShortcut("/deep")).toEqual({ kind: "help" });
    expect(parseShortcut("/research")).toEqual({ kind: "research", tab: "reports" });
  });
});

describe("webShortcut", () => {
  it("asks the questions, opens the pages the website has, and shows the list", () => {
    expect(webShortcut("/analyze SOL")).toMatchObject({ kind: "ask" });
    expect(webShortcut("/portfolio")).toEqual({ kind: "open", href: "/portfolio" });
    expect(webShortcut("/research")).toEqual({ kind: "open", href: "/research" });
    expect(webShortcut("/help")).toEqual({ kind: "help" });
  });

  it("asks anything the website has no page for as typed, without the slash", () => {
    expect(webShortcut("/swap 1 SOL to USDC")).toEqual({ kind: "ask", prompt: "swap 1 SOL to USDC" });
    expect(webShortcut("/whatever this is")).toEqual({ kind: "ask", prompt: "whatever this is" });
    expect(webShortcut("/settings")).toEqual({ kind: "ask", prompt: "settings" });
  });

  it("leads the website's menu with the analysis shortcuts, keeping every other", () => {
    const menu = webShortcutMenu(matchingShortcuts("/"));
    expect(menu.slice(0, 7).map((entry) => entry.command)).toEqual(["analyze", "research", "safe", "sentiment", "compare", "macro", "deep"]);
    expect(menu).toHaveLength(matchingShortcuts("/").length);
  });

  it("leaves a line that is not a shortcut alone", () => {
    expect(webShortcut("what is SOL doing")).toBeNull();
    expect(webShortcut("1/2 of my SOL")).toBeNull();
  });
});

describe("follow-ups", () => {
  it("finds the token an analysis question is about", () => {
    expect(analysisSubject("Analyze SOL right now: price and market data")).toEqual({ kind: "overview", subject: "SOL" });
    expect(analysisSubject("tell me about $jup")).toEqual({ kind: "overview", subject: "JUP" });
    expect(analysisSubject(`Is this token safe? ${MINT}`)).toEqual({ kind: "safety", subject: MINT });
    expect(analysisSubject("What's the market sentiment for BTC?")).toEqual({ kind: "sentiment", subject: "BTC" });
    expect(analysisSubject("Give me deep research on BONK.")).toEqual({ kind: "deep", subject: "BONK" });
    expect(analysisSubject("Analyze BRK.B right now")).toEqual({ kind: "overview", subject: "BRK.B" });
  });

  it("offers nothing for any other question", () => {
    expect(analysisFollowUps("How is my portfolio doing?")).toEqual([]);
    expect(analysisFollowUps("tell me about the market")).toEqual([]);
  });

  it("offers what to ask next, from the question alone", () => {
    expect(analysisFollowUps("Analyze SOL right now")).toEqual(["What are the risks for SOL?", "Give me deep research on SOL", "What's the market sentiment for SOL?"]);
    expect(analysisFollowUps(`Is this token safe? ${MINT}`)).toEqual([`Analyze ${MINT} right now`, `What's the market sentiment for ${MINT}?`]);
  });
});
