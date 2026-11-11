import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   The events routes against the fake database: anyone reads the feed; likes
   and saves need a session, belong to that account only, and show as counts
   to everyone; the saved filter shows the viewer's own saves.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string; profileStore: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) => user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} needs the database.`,
}));
vi.mock("@/lib/events/defillama", () => ({
  defillamaHacks: async () => [
    {
      date: Date.parse("2025-02-21T00:00:00Z") / 1000,
      name: "Bybit",
      amount: 1_400_000_000,
      chain: ["Ethereum"],
      classification: "Infrastructure",
      technique: "Signer Phishing",
      description: null,
      source: null,
      returnedFunds: null,
      defillamaId: "5001",
    },
  ],
}));

const feed = await import("@/app/api/events/route");
const marks = await import("@/app/api/events/marks/route");
import { MILESTONES } from "@/lib/events/history";
import type { EventsPage } from "@/lib/events/types";

const as = (userId: string | null) => {
  state.user = userId === null ? null : { userId, profileStore: "ready" };
};
const read = async (query = "") => (await (await feed.GET(new NextRequest(`http://test/api/events${query}`))).json()) as EventsPage;
const mark = (body: Record<string, unknown>) => marks.POST(new Request("http://test/api/events/marks", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.db = new FakeSupabase();
  state.db.seed("event_posts", [
    {
      id: "00000000-0000-4000-8000-0000000000aa",
      post_key: "onthisday:2026-11-11",
      kind: "onthisday",
      refers_to: null,
      title: "On this day: FTX files for bankruptcy",
      body: "On this day in 2022, FTX filed for bankruptcy.",
      facts: [],
      model: "test-model",
      amount_usd: null,
      chains: [],
      source_url: null,
      occurred_at: "2026-11-11T06:00:00.000Z",
      created_at: "2026-11-11T06:00:00.000Z",
    },
  ]);
  as(null);
});

describe("reading the feed", () => {
  it("is open to anyone: AI posts first, then the history with DefiLlama's hacks", async () => {
    const page = await read();
    expect(page.signedIn).toBe(false);
    expect(page.items[0]).toMatchObject({ key: "post:00000000-0000-4000-8000-0000000000aa", source: "ai", model: "test-model" });
    expect(page.items.some((item) => item.key === "hack:5001" && item.title === "Bybit: $1.4 billion taken")).toBe(true);
    expect(page.items.some((item) => item.key === "milestone:the-merge")).toBe(true);
    /* One post, every milestone and the one hack: a single page. */
    expect(page.items).toHaveLength(1 + MILESTONES.length + 1);
    expect(page.next).toBeNull();
  });

  it("filters to hacks", async () => {
    const page = await read("?filter=hacks");
    expect(page.items.map((item) => item.key)).toEqual(["hack:5001"]);
  });
});

describe("likes and saves", () => {
  it("need a session", async () => {
    expect((await mark({ itemKey: "hack:5001", mark: "like", on: true })).status).toBe(401);
    expect(state.db.rows("event_marks")).toEqual([]);
  });

  it("count for everyone, show as the viewer's own only to them, and undo", async () => {
    as("user-a");
    expect((await mark({ itemKey: "hack:5001", mark: "like", on: true })).status).toBe(200);
    expect((await mark({ itemKey: "hack:5001", mark: "like", on: true })).status).toBe(200);
    as("user-b");
    await mark({ itemKey: "hack:5001", mark: "like", on: true });

    const bybit = async () => (await read("?filter=hacks")).items[0];
    expect(await bybit()).toMatchObject({ likes: 2, liked: true });
    as(null);
    expect(await bybit()).toMatchObject({ likes: 2, liked: false });

    as("user-b");
    await mark({ itemKey: "hack:5001", mark: "like", on: false });
    expect(await bybit()).toMatchObject({ likes: 1, liked: false });
  });

  it("are listed under Saved for the viewer only", async () => {
    as("user-a");
    await mark({ itemKey: "milestone:the-merge", mark: "save", on: true });
    expect((await read("?filter=saved")).items.map((item) => item.key)).toEqual(["milestone:the-merge"]);
    as("user-b");
    expect((await read("?filter=saved")).items).toEqual([]);
    as(null);
    expect(await read("?filter=saved")).toMatchObject({ items: [], signedIn: false });
  });

  it("refuse a malformed key or mark", async () => {
    as("user-a");
    expect((await mark({ itemKey: "javascript:alert(1)", mark: "like", on: true })).status).toBe(404);
    expect((await mark({ itemKey: "hack:5001", mark: "repost", on: true })).status).toBe(400);
  });
});
