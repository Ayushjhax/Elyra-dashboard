import { beforeEach, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   A new account's watchlist starts with Solana, Jupiter and Hyperliquid, in
   that order — and seeding never undoes what the person already has.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

import { readWatchlist, removeFromWatchlist, seedWatchlist } from "@/lib/watchlist";

beforeEach(() => {
  state.db = new FakeSupabase();
});

it("starts a new account with SOL, JUP and HYPE", async () => {
  await seedWatchlist("user-1");
  expect(await readWatchlist("user-1")).toEqual(["SOL", "JUP", "HYPE"]);
});

it("keeps a symbol the person already has, and its place", async () => {
  state.db.seed("watchlist", [{ user_id: "user-1", symbol: "SOL", position: 0, added_at: "2026-01-01T00:00:00.000Z" }]);
  await seedWatchlist("user-1");
  expect(await readWatchlist("user-1")).toEqual(["SOL", "JUP", "HYPE"]);
});

it("leaves a list the person emptied empty — reading never seeds", async () => {
  await seedWatchlist("user-1");
  for (const symbol of ["SOL", "JUP", "HYPE"]) await removeFromWatchlist("user-1", symbol);
  expect(await readWatchlist("user-1")).toEqual([]);
});
