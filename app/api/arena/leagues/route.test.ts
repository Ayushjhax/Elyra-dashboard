import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Leagues against the fake database, end to end: forming by invite code,
   a snake draft where nobody can hold a market twice and a run-out clock
   picks for you, free-agent moves that count from the next round, and the
   tick settling rounds from Hyperliquid's daily opens into a table and a
   champion. Managers are shown by handle only; the user is the session's.
--------------------------------------------------------------------------- */

const DAY = 86_400_000;
const START = Date.parse("2026-11-16T20:00:00.000Z");

/* Each market opens a little higher every day, by its own step: BTC +1% a day, others less. */
const STEP: Record<string, number> = { BTC: 0.01, ETH: 0.005, SOL: -0.01, HYPE: 0.02, BNB: 0, XRP: -0.005 };
const openOn = (coin: string, day: number) => 100 * (1 + (STEP[coin] ?? 0.001) * day);
const dayIndex = (at: number) => Math.round((at - Date.parse("2026-11-17T00:00:00.000Z")) / DAY);

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string; profileStore: string; walletAddress: string },
  candleCalls: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) => user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} needs the database.`,
}));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async (coin: string, _interval: string, start: number, end: number) => {
    state.candleCalls += 1;
    const bars = [];
    for (let at = Math.ceil(start / DAY) * DAY; at <= end; at += DAY) {
      const open = openOn(coin, dayIndex(at));
      bars.push({ openTime: at, closeTime: at + DAY - 1, open, high: open, low: open, close: openOn(coin, dayIndex(at) + 1) });
    }
    return bars;
  },
  allMids: async () => Object.fromEntries(Object.keys(STEP).map((coin) => [coin, String(openOn(coin, dayIndex(Date.now())) * 1.001)])),
}));
vi.mock("@/lib/arena/writer", () => ({
  writeFromFacts: async (_task: string, _facts: string[], fallback: string) => ({ text: fallback, model: "fallback" }),
}));

const leagues = await import("@/app/api/arena/leagues/route");
const league = await import("@/app/api/arena/leagues/[id]/route");
const { runLeagues } = await import("@/lib/arena/leagueEngine");

const USERS = { ana: "00000000-0000-4000-8000-00000000a001", ben: "00000000-0000-4000-8000-00000000b002", cy: "00000000-0000-4000-8000-00000000c003" };
type Who = keyof typeof USERS;

const as = (who: Who | null) => {
  state.user = who === null ? null : { userId: USERS[who], profileStore: "ready", walletAddress: `wallet-of-${who}` };
};
const post = (body: unknown) => new Request("http://test/api/arena/leagues", { method: "POST", body: JSON.stringify(body) });
const json = async (response: Response) => (await response.json()) as Record<string, unknown>;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const settings = { action: "create", name: "Friday desk", rosterSize: 3, rounds: 3, roundDays: 1, pickSeconds: 120 };

async function create(who: Who, overrides: Record<string, unknown> = {}): Promise<string> {
  as(who);
  const response = await leagues.POST(post({ ...settings, ...overrides }));
  expect(response.status).toBe(201);
  return (await json(response)).id as string;
}

async function act(who: Who, id: string, body: Record<string, unknown>) {
  as(who);
  const response = await league.POST(post(body), context(id));
  return { status: response.status, body: await json(response) };
}

async function view(who: Who, id: string) {
  as(who);
  const response = await league.GET(new Request("http://test"), context(id));
  return { status: response.status, body: await json(response) };
}

type LeagueBody = {
  status: string;
  inviteCode: string;
  draft: { onClock: { handle: string; me: boolean; deadline: string } | null; picks: { handle: string; market: string; auto: boolean }[]; board: string[] };
  managers: { handle: string }[];
  rosters: { handle: string; lineup: string[]; held: string[] }[];
  season: { startsAt: string; round: number } | null;
  movesLeft: number;
  standings: { handle: string; wins: number; losses: number }[];
  champion: string | null;
  myMatchup: { live: boolean; home: { handle: string; pct: number | null }; away: { handle: string; pct: number | null } | null } | null;
  schedule: { round: number; recap: string | null }[];
};
const leagueOf = (body: Record<string, unknown>) => body.league as LeagueBody;

beforeEach(() => {
  state.db = new FakeSupabase();
  state.candleCalls = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  for (const [handle, id] of Object.entries(USERS)) state.db.seed("arena_profiles", [{ user_id: id, handle, public: false }]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Ana and Ben in a league, draft started; returns the league id and who picks first. */
async function draftingLeague(overrides: Record<string, unknown> = {}): Promise<{ id: string; first: Who; second: Who }> {
  const id = await create("ana", overrides);
  const code = leagueOf((await view("ana", id)).body).inviteCode;
  as("ben");
  expect((await leagues.POST(post({ action: "join", code }))).status).toBe(201);
  expect((await act("ana", id, { action: "start" })).status).toBe(200);
  const onClock = leagueOf((await view("ana", id)).body).draft.onClock;
  const first = onClock?.handle as Who;
  return { id, first, second: first === "ana" ? "ben" : "ana" };
}

/** Picks the whole draft by hand, in snake order: first gets BTC, HYPE, XRP; second ETH, SOL, BNB. */
async function draftAll(id: string, first: Who, second: Who) {
  const picks: [Who, string][] = [
    [first, "BTC"],
    [second, "ETH"],
    [second, "SOL"],
    [first, "HYPE"],
    [first, "XRP"],
    [second, "BNB"],
  ];
  for (const [who, market] of picks) expect((await act(who, id, { action: "pick", market })).status).toBe(200);
}

describe("forming a league", () => {
  it("needs a handle, because a league sees its managers by one", async () => {
    state.db.seed("arena_profiles", [{ user_id: "00000000-0000-4000-8000-00000000d004", handle: null, public: false }]);
    state.user = { userId: "00000000-0000-4000-8000-00000000d004", profileStore: "ready", walletAddress: "w" };
    const response = await leagues.POST(post(settings));
    expect(response.status).toBe(400);
    expect((await json(response)).error).toMatch(/handle/);
  });

  it("is joined by code, is visible to its managers only, and never names anyone by wallet or id", async () => {
    const id = await create("ana");
    expect((await view("ben", id)).status).toBe(404);
    const code = leagueOf((await view("ana", id)).body).inviteCode;
    as("ben");
    expect((await leagues.POST(post({ action: "join", code: code.toLowerCase() }))).status).toBe(201);
    const seen = await view("ben", id);
    expect(seen.status).toBe(200);
    expect(leagueOf(seen.body).managers.map((m) => m.handle).sort()).toEqual(["ana", "ben"]);
    const text = JSON.stringify(seen.body);
    for (const userId of Object.values(USERS)) expect(text).not.toContain(userId);
    expect(text).not.toContain("wallet-of");
  });

  it("starts only by its owner, with two managers or more, and then closes to new ones", async () => {
    const id = await create("ana");
    expect((await act("ana", id, { action: "start" })).body.error).toMatch(/two managers/);
    const code = leagueOf((await view("ana", id)).body).inviteCode;
    as("ben");
    await leagues.POST(post({ action: "join", code }));
    expect((await act("ben", id, { action: "start" })).status).toBe(403);
    expect((await act("ana", id, { action: "start" })).status).toBe(200);
    as("cy");
    const late = await leagues.POST(post({ action: "join", code }));
    expect(late.status).toBe(400);
    expect((await json(late)).error).toMatch(/closed/);
    expect((await act("ben", id, { action: "leave" })).body.error).toMatch(/plays to the end/);
  });

  it("lets a manager leave before the draft, and the owner close it", async () => {
    const id = await create("ana");
    const code = leagueOf((await view("ana", id)).body).inviteCode;
    as("ben");
    await leagues.POST(post({ action: "join", code }));
    expect((await act("ben", id, { action: "leave" })).body.left).toBe("left");
    expect((await act("ana", id, { action: "leave" })).body.left).toBe("deleted");
    expect(state.db.rows("arena_leagues")).toHaveLength(0);
  });
});

describe("the draft", () => {
  it("takes picks in snake order, one manager per market, and only from whoever is on the clock", async () => {
    const { id, first, second } = await draftingLeague();
    expect((await act(second, id, { action: "pick", market: "BTC" })).body.error).toMatch(new RegExp(`@${first}'s pick`));
    expect((await act(first, id, { action: "pick", market: "BTC" })).status).toBe(200);
    expect((await act(second, id, { action: "pick", market: "BTC" })).body.error).toMatch(/already drafted/);
    expect((await act(second, id, { action: "pick", market: "ETH" })).status).toBe(200);
    /* The snake: the second manager picks again. */
    expect(leagueOf((await view(first, id)).body).draft.onClock?.handle).toBe(second);
  });

  it("picks the first market on the board for a manager whose clock runs out", async () => {
    const { id, first, second } = await draftingLeague();
    await act(first, id, { action: "pick", market: "ETH" });
    vi.setSystemTime(START + 2 * 60_000 + 5_000);
    const seen = leagueOf((await view(first, id)).body);
    expect(seen.draft.picks[1]).toMatchObject({ handle: second, market: "BTC", auto: true });
    /* The next clock started when the last one ran out, not when someone looked. */
    expect(seen.draft.onClock?.handle).toBe(second);
  });

  it("goes active at the last pick, with a schedule and a season from the next midnight", async () => {
    const { id, first, second } = await draftingLeague();
    await draftAll(id, first, second);
    const seen = leagueOf((await view("ana", id)).body);
    expect(seen.status).toBe("active");
    expect(seen.season).toEqual({ startsAt: "2026-11-17T00:00:00.000Z", round: 0 });
    expect(state.db.rows("arena_league_matchups")).toHaveLength(3);
    expect(seen.rosters.find((r) => r.handle === first)?.lineup).toEqual(["BTC", "HYPE", "XRP"]);
    expect(seen.myMatchup?.away).not.toBeNull();
  });
});

describe("free-agent moves", () => {
  it("count from the next round, at most two a round, and never take a held market", async () => {
    const { id, first, second } = await draftingLeague();
    await draftAll(id, first, second);
    vi.setSystemTime(Date.parse("2026-11-17T06:00:00.000Z"));
    expect((await act(first, id, { action: "move", drop: "XRP", add: "ETH" })).body.error).toMatch(/already holds/);
    expect((await act(first, id, { action: "move", drop: "XRP", add: "LINK" })).status).toBe(200);
    let seen = leagueOf((await view(first, id)).body);
    const mine = seen.rosters.find((r) => r.handle === first);
    expect(mine?.lineup).toEqual(["BTC", "HYPE", "XRP"]);
    expect(mine?.held.sort()).toEqual(["BTC", "HYPE", "LINK"]);
    expect(seen.movesLeft).toBe(1);
    /* XRP is free again — for next round. */
    expect((await act(second, id, { action: "move", drop: "BNB", add: "XRP" })).status).toBe(200);
    await act(first, id, { action: "move", drop: "LINK", add: "AVAX" });
    expect((await act(first, id, { action: "move", drop: "AVAX", add: "SUI" })).body.error).toMatch(/2 moves/);
    seen = leagueOf((await view(first, id)).body);
    expect(seen.movesLeft).toBe(0);
  });
});

describe("the tick", () => {
  it("scores the round live, settles it from daily opens, tells each manager, and crowns a champion", async () => {
    const { id, first, second } = await draftingLeague();
    await draftAll(id, first, second);
    const notices: { userId: string; title: string; lines: string[] }[] = [];
    const notify = async (userId: string, title: string, lines: string[]) => {
      notices.push({ userId, title, lines });
    };

    /* Draft done: everyone hears once. */
    await runLeagues(START + 60_000, notify);
    await runLeagues(START + 120_000, notify);
    expect(notices.filter((n) => /draft is done/.test(n.title))).toHaveLength(2);

    /* Mid-round, the matchup is live against the mid. */
    vi.setSystemTime(Date.parse("2026-11-17T12:00:00.000Z"));
    const midRound = leagueOf((await view(first, id)).body);
    expect(midRound.myMatchup?.live).toBe(true);
    expect(midRound.myMatchup?.home.pct).not.toBeNull();

    /* Not before the next daily bar has opened and the settle delay has passed. */
    expect((await runLeagues(Date.parse("2026-11-18T00:05:00.000Z"), notify)).roundsSettled).toBe(0);
    for (const day of [18, 19, 20]) {
      const report = await runLeagues(Date.parse(`2026-11-${day}T00:15:00.000Z`), notify);
      expect(report.roundsSettled).toBe(1);
    }
    /* first holds BTC +1%, HYPE +2%, XRP −0.5% a day; second ETH +0.5%, SOL −1%, BNB 0: first wins every round. */
    vi.setSystemTime(Date.parse("2026-11-20T01:00:00.000Z"));
    const done = leagueOf((await view(first, id)).body);
    expect(done.status).toBe("done");
    expect(done.champion).toBe(first);
    expect(done.standings.map((row) => [row.handle, row.wins, row.losses])).toEqual([
      [first, 3, 0],
      [second, 0, 3],
    ]);
    expect(done.schedule.every((round) => round.recap !== null)).toBe(true);
    expect(notices.filter((n) => /round 1/.test(n.title))).toHaveLength(2);
    expect(notices.filter((n) => /season is over/.test(n.title))).toHaveLength(2);
    const winnerNotice = notices.find((n) => n.userId === USERS[first] && /round 2/.test(n.title));
    expect(winnerNotice?.lines[0]).toMatch(/^You won against @/);

    /* Settled once: a second pass changes nothing. */
    const again = await runLeagues(Date.parse("2026-11-21T00:15:00.000Z"), notify);
    expect(again.roundsSettled).toBe(0);
    /* Daily opens are cached: one fetch per market and day range, never per viewer. */
    expect(state.db.rows("arena_market_opens").length).toBeGreaterThan(0);
  });

  it("makes run-out picks in a slow draft and tells the manager on the clock once", async () => {
    const { id, first } = await draftingLeague({ pickSeconds: 3600 });
    const notices: { userId: string; title: string }[] = [];
    const notify = async (userId: string, title: string) => {
      notices.push({ userId, title });
    };
    await runLeagues(START + 60_000, notify);
    await runLeagues(START + 120_000, notify);
    expect(notices).toEqual([{ userId: USERS[first], title: "Your pick in Friday desk" }]);
    const report = await runLeagues(START + 3600_000 + 60_000, notify);
    expect(report.autoPicks).toBe(1);
    expect(leagueOf((await view("ana", id)).body).draft.picks).toHaveLength(1);
  });
});
