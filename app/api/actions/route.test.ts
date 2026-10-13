import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   /api/actions — the workspace's actions awaiting review.

   What matters: the user is always the session's, a confirmation needs a
   wallet signature as evidence, and nothing here can reach another account.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string | null; profileStore: "ready" | "unreachable" },
}));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) =>
    user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} need the database.`,
}));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SIGNATURE = "5".repeat(88);

async function seed(userId: string, status = "prepared") {
  const { storePreparedAction } = await import("@/lib/telegram/actions");
  const record = await storePreparedAction({
    userId,
    surface: "telegram",
    action: {
      id: "a",
      kind: "swap",
      summary: "Swap 2 SOL to USDC",
      fields: [],
      readiness: "ready",
      reason: null,
      warnings: [],
      preparedAt: new Date().toISOString(),
      params: { symbol: "SOL", toSymbol: "USDC", quantity: 2 },
    },
  });
  /* The fake's ids are not uuids; the route validates the real shape. */
  const row = state.db.rows("prepared_actions").find((entry) => entry.id === record!.id)!;
  row.id = crypto.randomUUID();
  row.status = status;
  return row.id as string;
}

const post = (body: unknown) =>
  new Request("http://test/api/actions", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.db = new FakeSupabase();
  state.user = { userId: USER_A, profileStore: "ready" };
});

describe("GET /api/actions", () => {
  it("refuses without a session", async () => {
    state.user = null;
    const { GET } = await import("@/app/api/actions/route");
    expect((await GET(new Request("http://test/api/actions"))).status).toBe(401);
  });

  it("says the database is down rather than returning an empty list", async () => {
    state.user = { userId: null, profileStore: "unreachable" };
    const { GET } = await import("@/app/api/actions/route");
    const response = await GET(new Request("http://test/api/actions"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/database/);
  });

  it("lists the session user's open actions and nobody else's", async () => {
    const mine = await seed(USER_A);
    await seed(USER_B);
    await seed(USER_A, "confirmed");
    const { GET } = await import("@/app/api/actions/route");
    const body = await (await GET(new Request("http://test/api/actions"))).json();
    expect(body.actions.map((entry: { id: string }) => entry.id)).toEqual([mine]);
    expect(body.actions[0].action.params).toEqual({ symbol: "SOL", toSymbol: "USDC", quantity: 2 });
  });
});

describe("POST /api/actions", () => {
  it("dismisses an action as cancelled", async () => {
    const id = await seed(USER_A);
    const { POST } = await import("@/app/api/actions/route");
    expect((await POST(post({ id, op: "dismiss" }))).status).toBe(200);
    expect(state.db.rows("prepared_actions")[0].status).toBe("cancelled");
  });

  it("will not confirm without a wallet signature", async () => {
    const id = await seed(USER_A);
    const { POST } = await import("@/app/api/actions/route");
    expect((await POST(post({ id, op: "confirm" }))).status).toBe(400);
    expect((await POST(post({ id, op: "confirm", signature: "not-a-signature" }))).status).toBe(400);
    expect(state.db.rows("prepared_actions")[0].status).toBe("prepared");

    expect((await POST(post({ id, op: "confirm", signature: SIGNATURE }))).status).toBe(200);
    expect(state.db.rows("prepared_actions")[0].status).toBe("confirmed");
  });

  it("cannot touch another user's action", async () => {
    const theirs = await seed(USER_B);
    const { POST } = await import("@/app/api/actions/route");
    expect((await POST(post({ id: theirs, op: "dismiss" }))).status).toBe(404);
    expect(state.db.rows("prepared_actions")[0].status).toBe("prepared");
  });

  it("rejects an unknown op or a malformed id", async () => {
    const id = await seed(USER_A);
    const { POST } = await import("@/app/api/actions/route");
    expect((await POST(post({ id, op: "execute" }))).status).toBe(400);
    expect((await POST(post({ id: "1; drop table", op: "dismiss" }))).status).toBe(400);
  });
});
