import { describe, expect, it } from "vitest";
import { isShortcutDraft, matchingShortcuts, parseShortcut, SHORTCUTS } from "@/lib/agent/shortcuts";

describe("parseShortcut", () => {
  it("opens the screen a command names", () => {
    expect(parseShortcut("/portfolio")).toEqual({ kind: "open", screen: "portfolio" });
    expect(parseShortcut("/positions")).toEqual({ kind: "open", screen: "risk" });
    expect(parseShortcut("/activity")).toEqual({ kind: "open", screen: "fills" });
    expect(parseShortcut("/markets")).toEqual({ kind: "open", screen: "markets" });
    expect(parseShortcut("/price sol")).toEqual({ kind: "asset", symbol: "SOL" });
  });

  it("prefills the swap form with whatever was given", () => {
    expect(parseShortcut("/swap 1.5 SOL to USDC")).toEqual({ kind: "swap", amount: "1.5", from: "SOL", to: "USDC" });
    expect(parseShortcut("/swap 2,5 jup for sol")).toEqual({ kind: "swap", amount: "2.5", from: "JUP", to: "SOL" });
    expect(parseShortcut("/swap")).toEqual({ kind: "swap", amount: null, from: null, to: null });
  });

  it("prefills the alert editor from a level", () => {
    expect(parseShortcut("/alert SOL > 120")).toEqual({ kind: "alert", symbol: "SOL", direction: "above", target: "120" });
    expect(parseShortcut("/alert btc below 95000")).toEqual({ kind: "alert", symbol: "BTC", direction: "below", target: "95000" });
    expect(parseShortcut("/alert ETH")).toEqual({ kind: "alert", symbol: "ETH", direction: null, target: null });
    expect(parseShortcut("/alert")).toEqual({ kind: "open", screen: "notifications" });
  });

  it("starts a report for a ticker", () => {
    expect(parseShortcut("/report NVDA")).toEqual({ kind: "report", symbol: "NVDA", query: "NVDA latest earnings" });
    expect(parseShortcut("/report")).toMatchObject({ kind: "ask" });
  });

  it("edits the watchlist only with an operation and a symbol", () => {
    expect(parseShortcut("/watch add sol")).toEqual({ kind: "watch", op: "add", symbol: "SOL" });
    expect(parseShortcut("/watch remove BTC")).toEqual({ kind: "watch", op: "remove", symbol: "BTC" });
    expect(parseShortcut("/watch")).toEqual({ kind: "open", screen: "markets" });
  });

  it("asks the agent where the app has no screen, in plain language", () => {
    expect(parseShortcut("/yield")).toEqual({ kind: "ask", prompt: "What are the current Kamino vault yields?" });
    expect(parseShortcut("/ask what moved?")).toEqual({ kind: "ask", prompt: "what moved?" });
    expect(parseShortcut("/backtest SOL rsi 12 1h 1y")).toEqual({ kind: "ask", prompt: "Backtest this strategy: SOL rsi 12 1h 1y." });
  });

  it("sends anything else as it was typed", () => {
    expect(parseShortcut("What do I hold?")).toEqual({ kind: "ask", prompt: "What do I hold?" });
    expect(parseShortcut("/unlink")).toEqual({ kind: "ask", prompt: "/unlink" });
    expect(parseShortcut("  /nonsense here ")).toEqual({ kind: "ask", prompt: "/nonsense here" });
  });

  it("lists every shortcut it parses, with its own wording", () => {
    for (const entry of SHORTCUTS) {
      const parsed = parseShortcut(`/${entry.command} ${entry.example}`.trim());
      expect(parsed.kind === "ask" && parsed.prompt.startsWith("/")).toBe(false);
    }
  });
});

describe("the shortcut list", () => {
  it("shows while a command is being typed, filtered by it", () => {
    expect(isShortcutDraft("/")).toBe(true);
    expect(isShortcutDraft("/po")).toBe(true);
    expect(isShortcutDraft("/swap 1")).toBe(false);
    expect(isShortcutDraft("hello")).toBe(false);
    expect(matchingShortcuts("/p").map((entry) => entry.command)).toEqual(["portfolio", "positions", "price", "predictions"]);
    expect(matchingShortcuts("/").length).toBe(SHORTCUTS.length);
  });
});
