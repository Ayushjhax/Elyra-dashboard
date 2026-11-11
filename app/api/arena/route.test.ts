import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Arena's routes against the fake database: calls are append-only and carry
   a receipt over the server's own timestamp; backing is held to the weekly
   points budget and to who may see a call; the puzzle is answered once and
   reveals only after; groups and handles decide who sees what, and nobody is
   ever shown by wallet. The user is always the session's, never the body's.
--------------------------------------------------------------------------- */

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-11T12:00:00.000Z");

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string; profileStore: string },
  candleCalls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) => user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} needs the database.`,
}));
/* Hourly bars that rise steadily: the hidden hours end higher. */
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async (_coin: string, _interval: string, start: number, end: number) => {
    state.candleCalls += 1;
    const from = Math.floor(start / HOUR) * HOUR;
    return Array.from({ length: Math.floor((end - from) / HOUR) }, (_, index) => {
      const openTime = from + index * HOUR;
      const close = 100 + index;
      return { openTime, closeTime: openTime + HOUR - 1, open: close - 1, high: close + 0.5, low: close - 1.5, close };
    });
  },
}));

const calls = await import("@/app/api/arena/calls/route");
const back = await import("@/app/api/arena/calls/[id]/back/route");
const puzzle = await import("@/app/api/arena/puzzle/route");
const groups = await import("@/app/api/arena/groups/route");
const profile = await import("@/app/api/arena/profile/route");
const arena = await import("@/app/api/arena/route");

const as = (userId: string | null) => {
  state.user = userId === null ? null : { userId, profileStore: "ready" };
};
const post = (body: unknown) => new Request("http://test/api/arena", { method: "POST", body: JSON.stringify(body) });
const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

const callBody = (overrides: Record<string, unknown> = {}) => ({
  market: "BTC",
  direction: "above",
  price: 95_000,
  resolvesAt: new Date(NOW + 24 * HOUR).toISOString(),
  confidence: 70,
  visibility: "groups",
  ...overrides,
});

async function postCall(userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  as(userId);
  const response = await calls.POST(post(callBody(overrides)));
  expect(response.status).toBe(201);
  return (await json(response)).id as string;
}

const backCall = (userId: string, id: string, body: Record<string, unknown>) => {
  as(userId);
  return back.POST(post(body), { params: Promise.resolve({ id }) });
};

async function read(userId: string) {
  as(userId);
  const response = await arena.GET(new Request("http://test/api/arena"));
  expect(response.status).toBe(200);
  return (await response.json()) as import("@/lib/arena/types").ArenaResponse;
}

/* user-a and user-b share a group; user-c is a stranger. */
async function shareAGroup() {
  as("user-a");
  expect((await groups.POST(post({ action: "create", name: "Desk" }))).status).toBe(201);
  const code = state.db.rows("arena_groups")[0].invite_code as string;
  as("user-b");
  expect((await groups.POST(post({ action: "join", code: code.toLowerCase() }))).status).toBe(201);
  return code;
}

beforeEach(() => {
  state.db = new FakeSupabase();
  state.candleCalls = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signed out", () => {
  it("refuses every route", async () => {
    as(null);
    expect((await arena.GET(new Request("http://test/api/arena"))).status).toBe(401);
    expect((await calls.POST(post(callBody()))).status).toBe(401);
    expect((await puzzle.POST(post({ direction: "up", confidence: 60 }))).status).toBe(401);
    expect((await groups.POST(post({ name: "x" }))).status).toBe(401);
    expect((await profile.POST(post({ handle: "abc" }))).status).toBe(401);
    expect(state.db.rows("arena_calls")).toEqual([]);
  });
});

describe("calls", () => {
  it("posts a call with a receipt over its statement and the server's time, for the session's user", async () => {
    const id = await postCall("user-a", { userId: "user-z" });
    const [row] = state.db.rows("arena_calls");
    expect(row).toMatchObject({ id, user_id: "user-a", status: "open", created_at: new Date(NOW).toISOString() });
    expect(row.statement).toBe("BTC closes above $95000 at 2026-11-12T12:00:00.000Z, 70% confident");
    const expected = createHash("sha256").update(`${row.statement}|${row.created_at}`, "utf8").digest("hex");
    expect(row.receipt).toBe(expected);
  });

  it("is append-only: the call routes export no way to edit or delete", () => {
    expect(Object.keys(calls).filter((name) => /^[A-Z]+$/.test(name))).toEqual(["POST"]);
    expect(Object.keys(back).filter((name) => /^[A-Z]+$/.test(name))).toEqual(["POST"]);
  });

  it("refuses an invalid call with its reason", async () => {
    as("user-a");
    const response = await calls.POST(post(callBody({ confidence: 100 })));
    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Confidence is a whole number from 50 to 99.");
  });

  it("posts a public call only under a public handle", async () => {
    as("user-a");
    const refused = await calls.POST(post(callBody({ visibility: "public" })));
    expect(refused.status).toBe(400);
    expect((await profile.POST(post({ handle: "Ayush_1", public: true }))).status).toBe(200);
    expect(state.db.rows("arena_profiles")[0]).toMatchObject({ handle: "ayush_1", public: true });
    await postCall("user-a", { visibility: "public" });
  });
});

describe("backing", () => {
  it("tails and fades from a weekly budget, once per call, and never one's own call", async () => {
    await shareAGroup();
    const first = await postCall("user-a");
    const second = await postCall("user-a", { price: 96_000 });

    expect((await backCall("user-a", first, { stance: "tail", points: 10 })).status).toBe(400);
    expect((await backCall("user-b", first, { stance: "tail", points: 60 })).status).toBe(201);
    const again = await backCall("user-b", first, { stance: "fade", points: 5 });
    expect(again.status).toBe(400);
    expect((await json(again)).error).toBe("You have already backed this call.");

    const over = await backCall("user-b", second, { stance: "fade", points: 41 });
    expect(over.status).toBe(400);
    expect((await json(over)).error).toBe("You have 40 of this week's 100 points left.");
    expect((await backCall("user-b", second, { stance: "fade", points: 40 })).status).toBe(201);

    const state_ = await read("user-b");
    expect(state_.points).toMatchObject({ budget: 100, spent: 100, week: "2026-W46" });
    expect(state_.feed.find((call) => call.id === first)?.myBacking).toEqual({ stance: "tail", points: 60, settledPoints: null });
  });

  it("hides a call from anyone it was not shared with", async () => {
    await shareAGroup();
    const shared = await postCall("user-a");
    const secret = await postCall("user-a", { visibility: "private" });
    expect((await backCall("user-c", shared, { stance: "tail", points: 1 })).status).toBe(404);
    expect((await backCall("user-b", secret, { stance: "tail", points: 1 })).status).toBe(404);
    expect((await backCall("user-b", "not-a-uuid", { stance: "tail", points: 1 })).status).toBe(404);
  });

  it("closes an hour before the call resolves", async () => {
    await shareAGroup();
    const id = await postCall("user-a", { resolvesAt: new Date(NOW + 90 * 60_000).toISOString() });
    vi.setSystemTime(NOW + 31 * 60_000);
    const late = await backCall("user-b", id, { stance: "tail", points: 1 });
    expect(late.status).toBe(400);
    expect((await json(late)).error).toBe("Backing closes an hour before a call resolves.");
  });
});

describe("the feed", () => {
  it("shows groupmates' shared calls and public calls from public handles, and never a private call", async () => {
    await shareAGroup();
    await postCall("user-a");
    await postCall("user-a", { visibility: "private", price: 1 });
    as("user-c");
    await profile.POST(post({ handle: "stranger", public: true }));
    await postCall("user-c", { visibility: "public", price: 90_000 });

    const seen = await read("user-b");
    expect(seen.feed.map((call) => call.price).sort()).toEqual([90_000, 95_000]);
    expect(seen.feed.find((call) => call.price === 90_000)?.author).toBe("stranger");
    /* user-a has no handle: shown as a group member, never by wallet. */
    expect(seen.feed.find((call) => call.price === 95_000)?.author).toBeNull();
    expect(seen.groups).toEqual([expect.objectContaining({ name: "Desk", members: 2, owner: false })]);

    /* Going private takes the public call out of strangers' feeds. */
    as("user-c");
    await profile.POST(post({ handle: "stranger", public: false }));
    expect((await read("user-b")).feed.map((call) => call.price)).toEqual([95_000]);
  });

  it("refuses a handle someone else holds, or one that is malformed", async () => {
    as("user-a");
    expect((await profile.POST(post({ handle: "desk_lead" }))).status).toBe(200);
    as("user-b");
    const taken = await profile.POST(post({ handle: "desk_lead" }));
    expect(taken.status).toBe(400);
    expect((await json(taken)).error).toBe("That handle is taken.");
    expect((await profile.POST(post({ handle: "no spaces" }))).status).toBe(400);
    expect((await profile.POST(post({ public: true }))).status).toBe(400);
  });

  it("refuses an unknown invite code", async () => {
    as("user-a");
    expect((await groups.POST(post({ action: "join", code: "NOPE2345" }))).status).toBe(404);
    expect((await groups.POST(post({ action: "create", name: "  " }))).status).toBe(400);
  });
});

describe("the puzzle", () => {
  it("hides the market and the hidden bars until answered, then reveals and rates once", async () => {
    const before = await read("user-a");
    expect(before.puzzle).toMatchObject({ number: 1, date: "2026-11-11", answer: null, reveal: null, rating: 1500, streak: 0, played: 0 });
    expect(before.puzzle!.visible).toHaveLength(72);
    expect(JSON.stringify(before.puzzle)).not.toMatch(/"market"/);
    expect(before.puzzle!.bots.momentumToday).toBeNull();

    as("user-a");
    const answered = await puzzle.POST(post({ direction: "up", confidence: 70 }));
    expect(answered.status).toBe(200);
    const view = (await json(answered)).puzzle as import("@/lib/arena/types").PuzzleView;
    expect(view.answer).toMatchObject({ correct: true, ratingBefore: 1500, ratingAfter: 1505.12 });
    expect(view.answer!.share).toBe("Elyra Puzzle #1 · Up 70% · Correct · Rating 1,505 (+5)");
    expect(view.reveal!.bars).toHaveLength(12);
    expect(view.streak).toBe(1);
    expect(view.played).toBe(1);

    as("user-a");
    const twice = await puzzle.POST(post({ direction: "down", confidence: 99 }));
    expect(twice.status).toBe(400);
    expect(state.db.rows("arena_puzzle_answers")).toHaveLength(1);

    /* Everyone gets the same day, built once. */
    const other = await read("user-b");
    expect(other.puzzle!.visible).toEqual(before.puzzle!.visible);
    expect(state.db.rows("arena_puzzle_days")).toHaveLength(1);
    expect(state.candleCalls).toBe(1);
  });

  it("carries the rating and streak to the next day, and drops the streak after a missed day", async () => {
    as("user-a");
    await puzzle.POST(post({ direction: "up", confidence: 70 }));
    vi.setSystemTime(NOW + 86_400_000);
    as("user-a");
    const next = (await json(await puzzle.POST(post({ direction: "up", confidence: 60 })))).puzzle as import("@/lib/arena/types").PuzzleView;
    expect(next.number).toBe(2);
    expect(next.answer!.ratingBefore).toBe(1505.12);
    expect(next.streak).toBe(2);

    vi.setSystemTime(NOW + 3 * 86_400_000);
    expect((await read("user-a")).puzzle).toMatchObject({ streak: 0, played: 2 });
  });

  it("refuses an answer without a direction or with an out-of-range confidence", async () => {
    as("user-a");
    expect((await puzzle.POST(post({ direction: "sideways", confidence: 60 }))).status).toBe(400);
    expect((await puzzle.POST(post({ direction: "up", confidence: 49 }))).status).toBe(400);
    expect(state.db.rows("arena_puzzle_answers")).toEqual([]);
  });
});
