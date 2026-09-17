import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Switching which Elyra account a Telegram chat answers for.

   The bug this guards against: a chat already linked to account A that
   redeems a fresh code for account B used to be told, for /link, "already
   linked, use /unlink" — and for /start, which is what the web app's own
   "Connect Telegram" button actually sends, the code was DROPPED entirely
   with a generic help reply and no sign anything had gone wrong. Either way
   the chat went on answering out of account A's data, silently, which is
   indistinguishable from the bot simply ignoring a fresh deposit.
--------------------------------------------------------------------------- */

const db = new FakeSupabase();

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => db }));

const { handleCommand, linkChat } = await import("@/lib/telegram/commands");

const TG_USER = 555;
const CHAT_ID = 555;

function seedCode(code: string, userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  db.seed("telegram_link_codes", [
    {
      code,
      user_id: userId,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  db.tables.clear();
});

describe("linkChat", () => {
  it("links a fresh chat to the code's account", async () => {
    seedCode("ABC123", "account-a");

    const reply = await linkChat({
      code: "abc123",
      telegramUserId: TG_USER,
      telegramChatId: CHAT_ID,
      telegramUsername: "ayush",
    });

    expect(reply).toContain("Linked");
    const rows = db.rows("telegram_links");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe("account-a");
  });

  it("re-points an already-linked chat to a different account", async () => {
    seedCode("OLDCOD", "account-a");
    await linkChat({
      code: "OLDCOD",
      telegramUserId: TG_USER,
      telegramChatId: CHAT_ID,
      telegramUsername: "ayush",
    });

    seedCode("NEWCOD", "account-b");
    const reply = await linkChat({
      code: "NEWCOD",
      telegramUserId: TG_USER,
      telegramChatId: CHAT_ID,
      telegramUsername: "ayush",
    });

    expect(reply).toContain("Switched");
    /* Exactly one row for this Telegram account — a switch re-points the
       existing link, it does not accumulate a second one. */
    const rows = db.rows("telegram_links").filter((r) => r.telegram_user_id === TG_USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe("account-b");
  });

  it("does not report a switch when the code belongs to the same account", async () => {
    seedCode("FIRST1", "account-a");
    await linkChat({
      code: "FIRST1",
      telegramUserId: TG_USER,
      telegramChatId: CHAT_ID,
      telegramUsername: "ayush",
    });

    seedCode("AGAIN1", "account-a");
    const reply = await linkChat({
      code: "AGAIN1",
      telegramUserId: TG_USER,
      telegramChatId: CHAT_ID,
      telegramUsername: "ayush",
    });

    expect(reply).toContain("Linked");
    expect(reply).not.toContain("Switched");
  });
});

describe("handleCommand — the already-linked dispatch", () => {
  /* This is the path that used to swallow a switch: the chat is ALREADY
     linked (that is why `handleCommand`, not `handleUnlinked`, is called at
     all), and a fresh code arrives anyway. */

  it("redeems a code sent as /link CODE instead of refusing", async () => {
    /* The real precondition for reaching `handleCommand` at all: the webhook
       only calls it once `linkedAccount()` has already found a row here. */
    db.seed("telegram_links", [{ telegram_user_id: TG_USER, user_id: "account-a" }]);
    seedCode("SWAP01", "account-b");

    const reply = await handleCommand({
      userId: "account-a",
      chatId: CHAT_ID,
      telegramUserId: TG_USER,
      text: "/link SWAP01",
      sessionWallet: null,
      telegramUsername: "ayush",
    });

    const text = Array.isArray(reply) ? reply.join("\n") : reply.chunks.join("\n");
    expect(text).toContain("Switched");
    expect(text).not.toMatch(/already linked/i);

    const rows = db.rows("telegram_links").filter((r) => r.telegram_user_id === TG_USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe("account-b");
  });

  it("redeems a code sent as /start CODE — the web app's own deep-link shape", async () => {
    /* `https://t.me/<bot>?start=<code>` is exactly what /api/telegram/link
       hands the "Connect Telegram" button, on every account, whether or not
       this chat already has a link. This used to hit the plain [HELP] reply
       here with no indication the code was ignored. */
    db.seed("telegram_links", [{ telegram_user_id: TG_USER, user_id: "account-a" }]);
    seedCode("DEEPLK", "account-c");

    const reply = await handleCommand({
      userId: "account-a",
      chatId: CHAT_ID,
      telegramUserId: TG_USER,
      text: "/start DEEPLK",
      sessionWallet: null,
      telegramUsername: "ayush",
    });

    const text = Array.isArray(reply) ? reply.join("\n") : reply.chunks.join("\n");
    expect(text).toContain("Switched");

    const rows = db.rows("telegram_links").filter((r) => r.telegram_user_id === TG_USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe("account-c");
  });

  it("still shows help for a bare /start, with no code", async () => {
    db.seed("telegram_links", [{ telegram_user_id: TG_USER, user_id: "account-a" }]);
    const reply = await handleCommand({
      userId: "account-a",
      chatId: CHAT_ID,
      telegramUserId: TG_USER,
      text: "/start",
      sessionWallet: null,
      telegramUsername: "ayush",
    });

    const text = Array.isArray(reply) ? reply.join("\n") : reply.chunks.join("\n");
    expect(text).not.toContain("Switched");
    /* Unchanged — the seeded link, untouched, not a second row. */
    expect(db.rows("telegram_links")).toHaveLength(1);
    expect(db.rows("telegram_links")[0]!.user_id).toBe("account-a");
  });

  it("guides toward a fresh code for a bare /link, with none supplied", async () => {
    db.seed("telegram_links", [{ telegram_user_id: TG_USER, user_id: "account-a" }]);
    const reply = await handleCommand({
      userId: "account-a",
      chatId: CHAT_ID,
      telegramUserId: TG_USER,
      text: "/link",
      sessionWallet: null,
      telegramUsername: "ayush",
    });

    const text = Array.isArray(reply) ? reply.join("\n") : reply.chunks.join("\n");
    expect(text).toMatch(/already linked/i);
    expect(text).toMatch(/fresh code|switch/i);
  });
});
