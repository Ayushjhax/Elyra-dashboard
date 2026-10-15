import { describe, expect, it } from "vitest";
import {
  AMBER_AT,
  GREEN_AT,
  SLOW_MS,
  VERY_SLOW_MS,
  health,
  latencyFactor,
  latencyTone,
  priceStateOf,
  rpcStateOf,
  toneFor,
  type RpcReport,
} from "./health";

/* The point of this suite is that the meter can actually go down. An
   indicator that reads 100% whatever happens is worse than no indicator,
   because it teaches the operator to stop looking at it. */

describe("scoring", () => {
  it("reads 100 when both upstreams answer promptly", () => {
    const result = health({ rpc: "ok", prices: "ok", latencyMs: 120 });
    expect(result.score).toBe(100);
    expect(result.tone).toBe("positive");
    expect(result.reason).toBe("All upstreams responding");
  });

  it("reports nothing rather than zero before anything has answered", () => {
    /* Zero would paint the first paint red, which is a failure nobody
       caused. The meter withholds instead. */
    const result = health({ rpc: "unknown", prices: "unknown", latencyMs: null });
    expect(result.score).toBeNull();
    expect(result.tone).toBe("unknown");
  });

  it("rescales to the subsystems that have reported", () => {
    /* A healthy RPC beside a price feed that has not answered yet must not
       read as 60% — that is a warning about nothing. The score is out of
       what was actually measurable. */
    const result = health({ rpc: "ok", prices: "unknown", latencyMs: 50 });
    expect(result.score).toBe(100);
  });

  it("weights the RPC above prices, because balances come from it", () => {
    const noRpc = health({ rpc: "down", prices: "ok", latencyMs: null });
    const noPrices = health({ rpc: "ok", prices: "down", latencyMs: 50 });
    expect(noRpc.score).toBeLessThan(noPrices.score!);
    expect(noRpc.score).toBe(40);
    expect(noPrices.score).toBe(60);
  });

  it("falls to zero when both are down", () => {
    const result = health({ rpc: "down", prices: "down", latencyMs: null });
    expect(result.score).toBe(0);
    expect(result.tone).toBe("negative");
  });

  it("treats an unconfigured RPC as down, and says which it is", () => {
    /* Same score, different sentence: one is an outage to wait out, the
       other is a variable to set. */
    const result = health({ rpc: "unconfigured", prices: "ok", latencyMs: null });
    expect(result.score).toBe(40);
    expect(result.reason).toBe("Solana RPC is not configured");
  });
});

describe("latency", () => {
  it("colours a round trip by the same thresholds the meter scores", () => {
    expect(latencyTone(null)).toBe("unknown");
    expect(latencyTone(SLOW_MS)).toBe("positive");
    expect(latencyTone(SLOW_MS + 24)).toBe("warning");
    expect(latencyTone(VERY_SLOW_MS)).toBe("negative");
  });

  it("does not penalise a fast endpoint", () => {
    expect(latencyFactor(null)).toBe(1);
    expect(latencyFactor(0)).toBe(1);
    expect(latencyFactor(SLOW_MS)).toBe(1);
  });

  it("halves the RPC's contribution at the far end, never zeroes it", () => {
    /* A slow endpoint is still returning correct balances. "Degraded" is
       the honest reading; "down" would be a lie. */
    expect(latencyFactor(VERY_SLOW_MS)).toBe(0.5);
    expect(latencyFactor(VERY_SLOW_MS * 10)).toBe(0.5);
  });

  it("degrades linearly in between", () => {
    const mid = (SLOW_MS + VERY_SLOW_MS) / 2;
    expect(latencyFactor(mid)).toBeCloseTo(0.75, 10);
  });

  it("drags the score down without any subsystem reporting a failure", () => {
    const fast = health({ rpc: "ok", prices: "ok", latencyMs: 100 });
    const slow = health({ rpc: "ok", prices: "ok", latencyMs: VERY_SLOW_MS });
    expect(fast.score).toBe(100);
    expect(slow.score).toBe(70);
    expect(slow.reason).toContain("slow to answer");
  });
});

describe("bands", () => {
  it("matches the specified thresholds at their boundaries", () => {
    expect(toneFor(GREEN_AT)).toBe("positive");
    expect(toneFor(GREEN_AT - 1)).toBe("warning");
    expect(toneFor(AMBER_AT)).toBe("warning");
    expect(toneFor(AMBER_AT - 1)).toBe("negative");
    expect(toneFor(null)).toBe("unknown");
  });
});

/* ---------------------------------------------------------------------------
   The transition the operator will actually watch for: setting
   SOLANA_RPC_URL should move the meter off its degraded reading.
--------------------------------------------------------------------------- */

const report = (over: Partial<RpcReport> = {}): RpcReport => ({
  unconfigured: false,
  isLoading: false,
  error: null,
  stale: false,
  hasSnapshot: true,
  ...over,
});

describe("subsystem mapping", () => {
  it("reads an unset SOLANA_RPC_URL as unconfigured, not as an outage", () => {
    expect(rpcStateOf(report({ unconfigured: true, hasSnapshot: false }))).toBe(
      "unconfigured",
    );
  });

  it("withholds judgement until the first attempt settles", () => {
    expect(rpcStateOf(report({ isLoading: true, hasSnapshot: false }))).toBe("unknown");
  });

  it("separates a failure with a stale reading from one without", () => {
    /* Both failed. Only one is still showing the user something true. */
    expect(rpcStateOf(report({ error: "boom", stale: true }))).toBe("degraded");
    expect(rpcStateOf(report({ error: "boom", stale: false, hasSnapshot: false }))).toBe(
      "down",
    );
  });

  it("keeps a degraded price feed above a dead one", () => {
    expect(priceStateOf("live")).toBe("ok");
    expect(priceStateOf("error")).toBe("degraded");
    expect(priceStateOf("loading")).toBe("unknown");
  });
});

describe("setting SOLANA_RPC_URL flips the meter", () => {
  /* The exact sequence: unset -> set but not yet answered -> answering. */
  const prices = priceStateOf("live");

  it("reads amber and names the cause while the variable is unset", () => {
    const before = health({
      rpc: rpcStateOf(report({ unconfigured: true, hasSnapshot: false })),
      prices,
      latencyMs: null,
    });
    expect(before.score).toBe(40);
    expect(before.tone).toBe("warning");
    expect(before.reason).toBe("Solana RPC is not configured");
  });

  it("reaches 100 and green once the endpoint answers", () => {
    const after = health({
      rpc: rpcStateOf(report()),
      prices,
      latencyMs: 180,
    });
    expect(after.score).toBe(100);
    expect(after.tone).toBe("positive");
    expect(after.reason).toBe("All upstreams responding");
  });

  it("scores only the price feed while the first RPC read is in flight", () => {
    /* Between the two states: configured, request out, nothing back. The RPC
       withdraws from the calculation rather than counting as either healthy
       or failed, so the score is the price feed's alone — which is why this
       reads 100 rather than 40. */
    const during = health({
      rpc: rpcStateOf(report({ isLoading: true, hasSnapshot: false })),
      prices,
      latencyMs: null,
    });
    expect(during.score).toBe(100);
    expect(during.reason).toBe("All upstreams responding");
  });

  it("a configured but slow endpoint lands green-but-not-full", () => {
    const slow = health({ rpc: rpcStateOf(report()), prices, latencyMs: 1_200 });
    expect(slow.score).toBeLessThan(100);
    expect(slow.tone).toBe("positive");
    expect(slow.reason).toContain("slow to answer");
  });
});
