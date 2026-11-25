import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  LEAGUE_POOL,
  MAX_MANAGERS,
  MOVES_PER_ROUND,
  autoPick,
  capacity,
  draftFits,
  draftRoundOf,
  fallbackRecap,
  heldBy,
  lineupFor,
  matchupResult,
  matchupShare,
  movePct,
  nextUtcMidnight,
  outcomeFor,
  pctText,
  recapFacts,
  roundAt,
  roundWindow,
  schedule,
  slotOnClock,
  standings,
  teamScore,
  validateLeague,
  validateMove,
  validatePick,
  type RosterSlot,
} from "@/lib/arena/league";

/* ---------------------------------------------------------------------------
   Leagues are fantasy sport played with markets: a snake draft, head-to-head
   rounds scored on the average move of a lineup, and a table. Every rule the
   page and the tick rely on is pinned here.
--------------------------------------------------------------------------- */

const settings = (overrides: Record<string, unknown> = {}) => ({ name: "Friday desk", rosterSize: 5, rounds: 6, roundDays: 7, pickSeconds: 120, ...overrides });

describe("validateLeague", () => {
  it("accepts a league and tidies its name", () => {
    expect(validateLeague(settings({ name: "  Friday   desk " }))).toEqual({ settings: { name: "Friday desk", rosterSize: 5, rounds: 6, roundDays: 7, pickSeconds: 120 } });
  });

  it("refuses settings outside the menu", () => {
    expect(validateLeague(settings({ name: " " }))).toEqual({ error: "Name the league." });
    expect(validateLeague(settings({ name: "x".repeat(41) }))).toHaveProperty("error");
    expect(validateLeague(settings({ rosterSize: 7 }))).toHaveProperty("error");
    expect(validateLeague(settings({ rounds: 2 }))).toHaveProperty("error");
    expect(validateLeague(settings({ rounds: 4.5 }))).toHaveProperty("error");
    expect(validateLeague(settings({ roundDays: 3 }))).toHaveProperty("error");
    expect(validateLeague(settings({ pickSeconds: 30 }))).toHaveProperty("error");
  });
});

describe("the draft", () => {
  it("snakes: first in odd rounds, last in even ones", () => {
    const order = Array.from({ length: 12 }, (_, pick) => slotOnClock(pick, 4));
    expect(order).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]);
    expect(draftRoundOf(0, 4)).toBe(1);
    expect(draftRoundOf(4, 4)).toBe(2);
  });

  it("auto-picks the first market still on the board", () => {
    expect(autoPick(new Set())).toBe(LEAGUE_POOL[0]);
    expect(autoPick(new Set(LEAGUE_POOL.slice(0, 3)))).toBe(LEAGUE_POOL[3]);
    expect(autoPick(new Set(LEAGUE_POOL))).toBeNull();
  });

  it("holds only as many managers as the board can fill", () => {
    expect(capacity(3)).toBe(Math.min(MAX_MANAGERS, Math.floor(LEAGUE_POOL.length / 3)));
    expect(capacity(6) * 6).toBeLessThanOrEqual(LEAGUE_POOL.length);
    expect(draftFits(1, 5)).toBe(false);
    expect(draftFits(2, 5)).toBe(true);
    expect(draftFits(capacity(6) + 1, 6)).toBe(false);
  });

  it("refuses a market already drafted or not in the pool", () => {
    expect(validatePick({ market: "btc" }, new Set())).toEqual({ market: "BTC" });
    expect(validatePick({ market: "BTC" }, new Set(["BTC"]))).toEqual({ error: "That market is already drafted." });
    expect(validatePick({ market: "NOPE" }, new Set())).toHaveProperty("error");
  });
});

describe("the season's clock", () => {
  const start = Date.parse("2026-11-17T00:00:00.000Z");

  it("starts at the first midnight after the last pick", () => {
    expect(nextUtcMidnight(Date.parse("2026-11-16T21:14:00.000Z"))).toBe(start);
    expect(nextUtcMidnight(start)).toBe(start + DAY_MS);
  });

  it("counts rounds: 0 before, 1…n during, n + 1 after", () => {
    expect(roundAt(start - 1, start, 7, 3)).toBe(0);
    expect(roundAt(start, start, 7, 3)).toBe(1);
    expect(roundAt(start + 7 * DAY_MS - 1, start, 7, 3)).toBe(1);
    expect(roundAt(start + 7 * DAY_MS, start, 7, 3)).toBe(2);
    expect(roundAt(start + 100 * DAY_MS, start, 7, 3)).toBe(4);
    expect(roundAt(start + 2 * DAY_MS, start, 1, 6)).toBe(3);
    expect(roundWindow(2, start, 7)).toEqual({ startsAt: start + 7 * DAY_MS, endsAt: start + 14 * DAY_MS });
  });
});

describe("schedule", () => {
  it("plays everyone once a turn, with nobody twice in a round", () => {
    const fixtures = schedule(["a", "b", "c", "d"], 3);
    for (let round = 1; round <= 3; round += 1) {
      const people = fixtures.filter((f) => f.round === round).flatMap((f) => [f.home, f.away]);
      expect(new Set(people).size).toBe(4);
    }
    const pairs = new Set(fixtures.map((f) => [f.home, f.away].sort().join("-")));
    expect(pairs.size).toBe(6);
  });

  it("gives one bye a round with an odd count, and cycles a longer season", () => {
    const fixtures = schedule(["a", "b", "c"], 6);
    for (let round = 1; round <= 6; round += 1) {
      const these = fixtures.filter((f) => f.round === round);
      expect(these).toHaveLength(2);
      expect(these.filter((f) => f.away === null)).toHaveLength(1);
    }
    const byes = fixtures.filter((f) => f.away === null).map((f) => f.home);
    expect(byes.filter((who) => who === "a")).toHaveLength(2);
    expect(byes.filter((who) => who === "b")).toHaveLength(2);
  });

  it("does not always list the same manager first", () => {
    const fixtures = schedule(["a", "b"], 4);
    expect(new Set(fixtures.map((f) => f.home)).size).toBe(2);
  });
});

describe("lineups", () => {
  const slots: RosterSlot[] = [
    { owner: "a", market: "BTC", fromRound: 1, toRound: null },
    { owner: "a", market: "SOL", fromRound: 1, toRound: 2 },
    { owner: "a", market: "HYPE", fromRound: 3, toRound: null },
    /* Added in pre-season and dropped before round 1: never counts. */
    { owner: "a", market: "DOGE", fromRound: 1, toRound: 0 },
  ];

  it("counts a dropped market through the round it was dropped in, and an added one from the next", () => {
    expect(lineupFor(slots, "a", 1)).toEqual(["BTC", "SOL"]);
    expect(lineupFor(slots, "a", 2)).toEqual(["BTC", "SOL"]);
    expect(lineupFor(slots, "a", 3)).toEqual(["BTC", "HYPE"]);
    expect(heldBy(slots, "a")).toEqual(["BTC", "HYPE"]);
  });
});

describe("scoring", () => {
  it("scores a team on the mean move of the markets that have prices", () => {
    const starts = new Map([["BTC", 100], ["SOL", 50], ["HYPE", 20]]);
    const ends = new Map([["BTC", 110], ["SOL", 45]]);
    const score = teamScore(["BTC", "SOL", "HYPE"], starts, ends);
    expect(score.pct).toBeCloseTo(0);
    expect(score.markets).toEqual([
      { market: "BTC", pct: expect.closeTo(10) },
      { market: "SOL", pct: expect.closeTo(-10) },
      { market: "HYPE", pct: null },
    ]);
    expect(teamScore(["HYPE"], starts, ends).pct).toBeNull();
    expect(movePct(0, 1)).toBeNull();
  });

  it("decides at two decimals, and voids a matchup without prices", () => {
    expect(matchupResult(1.234, 1.231)).toBe("tie");
    expect(matchupResult(1.24, 1.23)).toBe("home");
    expect(matchupResult(-3, 0.5)).toBe("away");
    expect(matchupResult(null, 2)).toBe("void");
    expect(outcomeFor("home", true)).toBe("won");
    expect(outcomeFor("home", false)).toBe("lost");
    expect(outcomeFor(null, true)).toBe("pending");
  });

  it("writes scores the way the page shows them", () => {
    expect(pctText(3.2149)).toBe("+3.21%");
    expect(pctText(-0.4)).toBe("−0.40%");
    expect(pctText(0.001)).toBe("0.00%");
    expect(pctText(null)).toBe("—");
  });
});

describe("standings", () => {
  it("ranks wins, then points for, and skips byes and void rounds", () => {
    const table = standings(
      ["a", "b", "c"],
      [
        { round: 1, home: "a", away: "b", homePct: 2, awayPct: 1, result: "home" },
        { round: 1, home: "c", away: null, homePct: 9, awayPct: null, result: "void" },
        { round: 2, home: "b", away: "c", homePct: 5, awayPct: 5, result: "tie" },
        { round: 3, home: "c", away: "a", homePct: 3, awayPct: -1, result: "away" },
        { round: 4, home: "a", away: "b", homePct: null, awayPct: 1, result: "void" },
      ],
    );
    expect(table.map((row) => [row.manager, row.wins, row.losses, row.ties, row.played])).toEqual([
      ["a", 2, 0, 0, 2],
      ["c", 0, 1, 1, 2],
      ["b", 0, 1, 1, 2],
    ]);
    /* c and b are level on the table; c has the bigger points for (8 to 6). */
    expect(table[1].pointsFor).toBe(8);
  });
});

describe("free-agent moves", () => {
  const context = { status: "active" as const, round: 2, rounds: 6, held: ["BTC", "SOL"], taken: new Set(["BTC", "SOL", "ETH"]), movesThisRound: 0 };

  it("swaps a held market for one nobody holds", () => {
    expect(validateMove({ drop: "SOL", add: "hype" }, context)).toEqual({ drop: "SOL", add: "HYPE" });
  });

  it("refuses what would break the rules", () => {
    expect(validateMove({ drop: "SOL", add: "ETH" }, context)).toEqual({ error: "Someone in the league already holds that market." });
    expect(validateMove({ drop: "DOGE", add: "HYPE" }, context)).toHaveProperty("error");
    expect(validateMove({ drop: "SOL", add: "HYPE" }, { ...context, movesThisRound: MOVES_PER_ROUND })).toHaveProperty("error");
    expect(validateMove({ drop: "SOL", add: "HYPE" }, { ...context, round: 6 })).toHaveProperty("error");
    expect(validateMove({ drop: "SOL", add: "HYPE" }, { ...context, status: "drafting" })).toHaveProperty("error");
  });
});

describe("the recap", () => {
  const input = {
    league: "Friday desk",
    round: 2,
    rounds: 6,
    matchups: [
      { home: "ana", away: "ben", homePct: 3.21, awayPct: -0.4, result: "home" as const },
      { home: "cy", away: null, homePct: 1, awayPct: null, result: null },
    ],
    markets: [
      { market: "SOL", manager: "ana", pct: 8.4 },
      { market: "DOGE", manager: "ben", pct: -6.1 },
    ],
  };

  it("hands the commentator only computed facts, with every number as the page writes it", () => {
    expect(recapFacts(input)).toEqual([
      "League: Friday desk",
      "Round 2 of 6",
      "@ana +3.21% beat @ben −0.40%",
      "@cy had a bye",
      "Best market started: SOL +8.40%, for @ana",
      "Worst market started: DOGE −6.10%, for @ben",
    ]);
  });

  it("writes its own recap from the same facts", () => {
    expect(fallbackRecap(input)).toBe("Round 2 of 6 is in the books. @ana beat @ben, +3.21% to −0.40%. SOL carried @ana at +8.40%.");
  });

  it("shares a result without emoji", () => {
    expect(matchupShare(3, "ben", "ana", -0.4, 3.21, "lost")).toBe("Elyra League · Round 3 · @ana +3.21% beat @ben −0.40%");
    expect(matchupShare(3, "cy", null, 1, null, "void")).toBe("Elyra League · Round 3 · @cy had a bye");
  });
});
