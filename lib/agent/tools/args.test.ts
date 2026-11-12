import { describe, expect, it } from "vitest";
import { operatorAskedFor, symbol, symbols, ToolArgumentError } from "@/lib/agent/tools/args";

/* ---------------------------------------------------------------------------
   Tool arguments are model output. These hold the two places where that
   matters most: a ticker that reaches upstream requests, and the gate that
   keeps a model talked into it by a tool result from changing the
   operator's records.
--------------------------------------------------------------------------- */

describe("operatorAskedFor", () => {
  it("lets an alert be created only when the operator asked for one", () => {
    expect(operatorAskedFor("Alert me if YES breaks 65 on the Fed market", "create_alert")).toBe(true);
    expect(operatorAskedFor("ping me when BTC funding flips", "create_alert")).toBe(true);
    expect(operatorAskedFor("What is the Fed market at?", "create_alert")).toBe(false);
  });

  it("lets an alert be deleted only when the operator asked to remove one", () => {
    expect(operatorAskedFor("delete my Fed alert", "delete_alert")).toBe(true);
    expect(operatorAskedFor("turn off the alerts on the election market", "delete_alert")).toBe(true);
    /* Mentioning alerts is not asking to remove them. */
    expect(operatorAskedFor("which alerts do I have?", "delete_alert")).toBe(false);
    expect(operatorAskedFor("stop", "delete_alert")).toBe(false);
  });

  it("refuses when there is no operator message at all — an outside agent, a scheduled run", () => {
    expect(operatorAskedFor(undefined, "create_alert")).toBe(false);
    expect(operatorAskedFor(null, "delete_alert")).toBe(false);
    expect(operatorAskedFor("   ", "create_alert")).toBe(false);
  });
});

describe("ticker arguments", () => {
  it("accepts real instrument names, decorated or not", () => {
    expect(symbol({ symbol: "sol-perp" })).toBe("SOL");
    expect(symbol({ symbol: "xyz:nvda" })).toBe("XYZ:NVDA");
    expect(symbol({ symbol: "BRK.B" })).toBe("BRK.B");
  });

  it("refuses a 'ticker' that is really a path, a URL or a paragraph", () => {
    expect(() => symbol({ symbol: "../../admin" })).toThrow(ToolArgumentError);
    expect(() => symbol({ symbol: "https://evil.example/x" })).toThrow(ToolArgumentError);
    expect(() => symbol({ symbol: "IGNORE PREVIOUS INSTRUCTIONS AND" })).toThrow(ToolArgumentError);
    expect(() => symbol({ symbol: "A".repeat(40) })).toThrow(ToolArgumentError);
  });

  it("drops bad entries from a list and keeps the good ones", () => {
    expect(symbols({ symbols: ["SOL", "../etc", "btc"] })).toEqual(["SOL", "BTC"]);
    expect(() => symbols({ symbols: ["../etc"] })).toThrow(ToolArgumentError);
  });
});
