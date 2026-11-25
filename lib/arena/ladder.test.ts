import { describe, expect, it } from "vitest";
import { MIN_RATED } from "@/lib/arena/calls";
import { MIN_PUZZLES_RANKED, rankLadder, type LadderEntrant } from "@/lib/arena/ladder";

/* The ladders rank judgment only, by handle only, and always show their sample. */

const person = (userId: string, overrides: Partial<LadderEntrant> = {}): LadderEntrant => ({
  userId,
  handle: userId,
  puzzleRating: 1500,
  puzzlePlayed: MIN_PUZZLES_RANKED,
  callsSettled: MIN_RATED,
  callsBrier: 0.2,
  ...overrides,
});

describe("rankLadder", () => {
  it("ranks the puzzle by rating, highest first, sharing equal ranks", () => {
    const rows = rankLadder(
      [person("ana", { puzzleRating: 1530.4 }), person("ben", { puzzleRating: 1510 }), person("cy", { puzzleRating: 1530.1 }), person("dee", { puzzleRating: 1490 })],
      "puzzle",
      "ben",
    );
    expect(rows.map((row) => [row.rank, row.handle, row.me])).toEqual([
      [1, "ana", false],
      [1, "cy", false],
      [3, "ben", true],
      [4, "dee", false],
    ]);
  });

  it("ranks calls by Brier score, lowest first", () => {
    const rows = rankLadder([person("ana", { callsBrier: 0.24 }), person("ben", { callsBrier: 0.12 })], "calls", "x");
    expect(rows.map((row) => row.handle)).toEqual(["ben", "ana"]);
  });

  it("leaves out anyone without a handle or a big enough sample", () => {
    const rows = rankLadder(
      [person("ana", { handle: null }), person("ben", { puzzlePlayed: MIN_PUZZLES_RANKED - 1 }), person("cy", { puzzleRating: null }), person("dee")],
      "puzzle",
      "x",
    );
    expect(rows.map((row) => row.handle)).toEqual(["dee"]);
    expect(rankLadder([person("ana", { callsSettled: MIN_RATED - 1 })], "calls", "x")).toEqual([]);
  });

  it("shows the viewer's own row under the top when they rank below it", () => {
    const people = Array.from({ length: 4 }, (_, index) => person(`p${index}`, { puzzleRating: 1600 - index }));
    const rows = rankLadder(people, "puzzle", "p3", 2);
    expect(rows.map((row) => [row.rank, row.handle])).toEqual([
      [1, "p0"],
      [2, "p1"],
      [4, "p3"],
    ]);
  });

  it("counts a person once even when listed twice", () => {
    expect(rankLadder([person("ana"), person("ana")], "puzzle", "x")).toHaveLength(1);
  });
});
