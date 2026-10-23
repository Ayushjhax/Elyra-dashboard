import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   A new code replaces the old one, and unlinking from the web cuts every
   chat — for this account and no other.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: { userId: "account-a", privyDid: "did:a", walletAddress: null, solanaAddress: null, profileStore: "ready" },
  sent: [] as Array<{ chatId: number; text: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) =>
    user.userId !== null && user.profileStore === "ready",
  profileUnavailable: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/telegram/api", () => ({
  sendMessage: async (chatId: number, text: string) => {
    state.sent.push({ chatId, text });
  },
}));

const { POST, DELETE } = await import("@/app/api/telegram/link/route");

const request = (method: string) => new Request("http://test/api/telegram/link", { method });
const liveCodes = (userId: string) =>
  state.db.rows("telegram_link_codes").filter((row) => row.user_id === userId && row.consumed_at == null);

beforeEach(() => {
  state.db = new FakeSupabase();
  state.sent = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_BOT_USERNAME = "ElyraTestBot";
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
});

describe("issuing a code", () => {
  it("revokes the account's earlier unredeemed code", async () => {
    const first = (await (await POST(request("POST"))).json()) as { code: string };
    const second = (await (await POST(request("POST"))).json()) as { code: string };

    expect(liveCodes("account-a").map((row) => row.code)).toEqual([second.code]);
    expect(second.code).not.toBe(first.code);
  });

  it("keeps redeemed codes, and leaves other accounts' codes alone", async () => {
    state.db.seed("telegram_link_codes", [
      { code: "USEDAA", user_id: "account-a", expires_at: new Date().toISOString(), consumed_at: new Date().toISOString() },
      { code: "BOTHER", user_id: "account-b", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null },
    ]);

    await POST(request("POST"));

    const codes = state.db.rows("telegram_link_codes").map((row) => row.code);
    expect(codes).toContain("USEDAA");
    expect(codes).toContain("BOTHER");
  });

  it("returns both ends of the window on the server's clock", async () => {
    const body = (await (await POST(request("POST"))).json()) as { issuedAt: string; expiresAt: string };
    expect(Date.parse(body.expiresAt) - Date.parse(body.issuedAt)).toBe(10 * 60_000);
  });
});

describe("unlinking from the web", () => {
  beforeEach(() => {
    state.db.seed("telegram_links", [
      { id: "l1", user_id: "account-a", telegram_user_id: 1, telegram_chat_id: 101, telegram_username: "a" },
      { id: "l2", user_id: "account-b", telegram_user_id: 2, telegram_chat_id: 202, telegram_username: "b" },
    ]);
  });

  it("removes this account's chats and no one else's, and tells the chat", async () => {
    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    expect(state.db.rows("telegram_links").map((row) => row.user_id)).toEqual(["account-b"]);
    expect(state.sent.map((message) => message.chatId)).toEqual([101]);
  });

  it("revokes outstanding codes, so a code issued earlier cannot relink", async () => {
    await POST(request("POST"));
    await DELETE(request("DELETE"));

    expect(liveCodes("account-a")).toEqual([]);
  });

  it("refuses a request with no session", async () => {
    const saved = state.user;
    state.user = null as unknown as typeof saved;
    try {
      expect((await DELETE(request("DELETE"))).status).toBe(401);
      expect(state.db.rows("telegram_links")).toHaveLength(2);
    } finally {
      state.user = saved;
    }
  });
});
