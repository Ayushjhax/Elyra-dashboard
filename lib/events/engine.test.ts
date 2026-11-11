import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Elyra's AI posts, from the tick, against the fake database: a new hack is
   posted once, however many ticks see it; small and old hacks are not; a
   one-day move of 8% or more in BTC, ETH or SOL is posted once per coin per
   day; "on this day" once per day when there is an anniversary; and a reply
   that strays from the facts is replaced by the code's own text.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  hacks: [] as Array<Record<string, unknown>>,
  changes: new Map<string, number>(),
  reply: async (): Promise<{ text: string; model: string }> => ({ text: "", model: "test-model" }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/events/defillama", () => ({ defillamaHacks: async () => state.hacks }));
vi.mock("@/lib/agent/providers/router", () => ({ route: async () => state.reply() }));
vi.mock("@/lib/market/pyth/catalog", () => ({
  assetsBySymbols: async (symbols: string[]) => symbols.map((symbol, index) => ({ id: index + 1, symbol, assetType: "crypto" })),
}));
vi.mock("@/lib/market/pyth/client", () => ({
  pricesForIds: async (ids: number[]) => ids.map((id) => ({ id, price: [0, 97000, 3500, 180][id] })),
}));
vi.mock("@/lib/market/pyth/change", () => ({
  dayStatsForAssets: async (assets: Array<{ id: number; symbol: string }>) =>
    new Map(assets.flatMap((asset) => (state.changes.has(asset.symbol) ? [[asset.id, { change24hPct: state.changes.get(asset.symbol), high24h: null, low24h: null, volume24h: null }]] : []))),
}));

const { runEvents } = await import("@/lib/events/engine");

const NOW = Date.parse("2026-11-11T12:00:00Z");
const day = (iso: string) => Date.parse(iso) / 1000;
const hack = (id: string, amount: number, iso = "2026-11-10T00:00:00Z") => ({
  date: day(iso),
  name: `Protocol ${id}`,
  amount,
  chain: ["Ethereum"],
  classification: "Protocol Logic",
  technique: "Withdrawal Logic Flaw",
  description: null,
  source: null,
  returnedFunds: null,
  defillamaId: id,
});

beforeEach(() => {
  state.db = new FakeSupabase();
  state.hacks = [];
  state.changes = new Map();
  state.reply = async () => ({ text: "", model: "test-model" });
});

describe("new hacks", () => {
  it("posts a hack once however many ticks see it, and skips small and old ones", async () => {
    state.hacks = [hack("1", 2_234_391), hack("2", 500_000), hack("3", 90_000_000, "2026-10-01T00:00:00Z")];
    state.reply = async () => ({ text: "Protocol 1 lost $2.2 million on Ethereum, as recorded by DefiLlama.", model: "test-model" });
    await runEvents(NOW);
    await runEvents(NOW);
    const hacks = () => state.db.rows("event_posts").filter((row) => row.kind === "hack");
    expect(hacks()).toHaveLength(1);
    const [row] = hacks();
    expect(row).toMatchObject({ post_key: "hack:1", kind: "hack", refers_to: "hack:1", title: "Protocol 1: $2.2 million taken", model: "test-model", chains: ["Ethereum"] });
    expect(row.body).toBe("Protocol 1 lost $2.2 million on Ethereum, as recorded by DefiLlama.");
  });

  it("posts at most three a run, largest first", async () => {
    state.hacks = ["1", "2", "3", "4"].map((id, index) => hack(id, (index + 1) * 10_000_000));
    await runEvents(NOW);
    expect(state.db.rows("event_posts").filter((row) => row.kind === "hack").map((row) => row.post_key)).toEqual(["hack:4", "hack:3", "hack:2"]);
    await runEvents(NOW);
    expect(state.db.rows("event_posts").map((row) => row.post_key)).toContain("hack:1");
  });

  it("uses the code's own text when the model invents a number", async () => {
    state.hacks = [hack("1", 2_234_391)];
    state.reply = async () => ({ text: "Protocol 1 lost $9 million, the third hack this week.", model: "test-model" });
    await runEvents(NOW);
    const [row] = state.db.rows("event_posts").filter((entry) => entry.kind === "hack");
    expect(row.model).toBe("fallback");
    expect(row.body).toBe("Protocol 1 has lost $2.2 million on Ethereum, as recorded by DefiLlama. The technique is recorded as withdrawal logic flaw.");
  });
});

describe("large moves", () => {
  it("posts a one-day move of 8% or more once per coin per day, and nothing smaller", async () => {
    state.changes = new Map([
      ["BTC", -9.4],
      ["ETH", 7.9],
      ["SOL", 12.1],
    ]);
    await runEvents(NOW);
    await runEvents(NOW);
    const moves = state.db.rows("event_posts").filter((row) => row.kind === "move");
    expect(moves.map((row) => [row.post_key, row.title])).toEqual([
      ["move:BTC:2026-11-11", "BTC down 9.4% in a day"],
      ["move:SOL:2026-11-11", "SOL up 12.1% in a day"],
    ]);
    await runEvents(NOW + 86_400_000);
    expect(state.db.rows("event_posts").filter((row) => row.kind === "move")).toHaveLength(4);
  });
});

describe("on this day", () => {
  it("posts once a day when the history has an anniversary", async () => {
    /* 11 November: FTX filed for bankruptcy in 2022. */
    await runEvents(NOW);
    await runEvents(NOW + 60_000);
    const posts = state.db.rows("event_posts").filter((row) => row.kind === "onthisday");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ post_key: "onthisday:2026-11-11", title: "On this day: FTX files for bankruptcy" });
    expect(posts[0].facts).toEqual(["2022: FTX files for bankruptcy"]);
  });

  it("posts nothing on a day with no anniversary", async () => {
    await runEvents(Date.parse("2026-02-03T12:00:00Z"));
    expect(state.db.rows("event_posts").filter((row) => row.kind === "onthisday")).toEqual([]);
  });
});
