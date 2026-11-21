import { describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The spoken reply, in the prompt: a voice conversation adds Elyra's own
   instruction for the persona the operator chose — and nothing at all for
   an id that is not on the list, so a request cannot write into the prompt
   through it.
--------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/watchlist", () => ({ readWatchlist: async () => ["BTC"] }));
vi.mock("@/lib/exchange/portfolio", () => ({
  getPortfolio: async () => ({ positions: [], equities: [], failures: [] }),
  summarise: () => ({
    equity: 0,
    totalUnrealizedPnl: 0,
    grossExposure: 0,
    netExposure: 0,
    largestPosition: null,
    positionCount: 0,
    venues: [],
    failures: [],
  }),
}));

const { buildUserContext } = await import("@/lib/agent/prompt");

const base = { userId: "u1", sessionWallet: null, solanaAddress: null, polymarketAddress: null };

describe("the spoken reply instruction", () => {
  it("is added for a persona on the list, after the language", async () => {
    const block = await buildUserContext({ ...base, locale: "zh-CN", voice: "wren" });
    expect(block).toMatch(/## Spoken reply/);
    expect(block).toMatch(/read aloud by Elyra's voice, Wren/);
    expect(block.indexOf("Reply language")).toBeLessThan(block.indexOf("## Spoken reply"));
  });

  it("is absent outside a voice conversation, and for an id not on the list", async () => {
    expect(await buildUserContext({ ...base })).not.toMatch(/Spoken reply/);
    expect(await buildUserContext({ ...base, voice: "pirate" as never })).not.toMatch(/Spoken reply/);
  });
});
