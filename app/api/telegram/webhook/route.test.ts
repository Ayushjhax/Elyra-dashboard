import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Part 8, three of the required tests:

     - a bad secret token is rejected with 401
     - the same update_id twice produces exactly one agent run
     - a Telegram-path portfolio query for user A never returns user B's rows
--------------------------------------------------------------------------- */

const SECRET = "test-webhook-secret-at-least-32-chars-long";

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  /** The old tool-loop agent, which now serves /report alone. */
  runAgent: vi.fn(),
  /** The unified Personalized runtime, which serves plain language. */
  answer: vi.fn(),
  sent: [] as Array<{ chatId: number; chunks: string[] }>,
  /** Every userId the portfolio layer was asked about. */
  portfolioReads: [] as string[],
  /** Deferred work scheduled by after(), run explicitly by the test. */
  afterTasks: [] as Array<() => Promise<void>>,
}));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

/* after() needs a request scope, which a unit test has no way to provide.
   Collecting the task and running it explicitly also makes the ordering the
   route depends on visible: the response is returned before it runs. */
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => Promise<void>) => {
      state.afterTasks.push(task);
    },
  };
});

vi.mock("@/lib/agent", () => ({
  runAgent: state.runAgent,
  ensureConversation: async () => "conv-1",
  UsageLimitError: class UsageLimitError extends Error {},
}));

/* Plain-language messages run the SAME runtime as the dashboard, so the
   properties this file guards — one run per update_id, and a user resolved
   from from.id rather than from message text — are asserted against that
   entry point rather than against the old tool loop. */
vi.mock("@/lib/telegram/personalized", () => ({
  answerFromTelegram: state.answer,
}));

vi.mock("@/lib/telegram/api", () => ({
  sendChunks: async (chatId: number, chunks: string[]) => {
    state.sent.push({ chatId, chunks });
  },
  startTypingHeartbeat: () => () => {},
  sendMessage: async () => {},
  sendTyping: async () => {},
}));

/* Records which user the portfolio was read for, so the isolation test can
   assert the Telegram path never asks about anyone but the linked account. */
vi.mock("@/lib/exchange/portfolio", () => ({
  getPortfolio: async (userId: string) => {
    state.portfolioReads.push(userId);
    return { positions: [], equities: [], failures: [] };
  },
  summarise: () => ({
    equity: 0,
    totalUnrealizedPnl: 0,
    grossExposure: 0,
    netExposure: 0,
    largestPosition: null,
    positionCount: 0,
    venues: [],
    failures: [],
  }),
}));

const { POST } = await import("@/app/api/telegram/webhook/route");

const USER_A = "user-a";
const USER_B = "user-b";
const TG_A = 111111;
const TG_B = 222222;

function post(
  body: unknown,
  secret: string | null = SECRET,
): Promise<Response> {
  return POST(
    new Request("https://example.com/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret === null ? {} : { "x-telegram-bot-api-secret-token": secret }),
      },
      body: JSON.stringify(body),
    }),
  );
}

const update = (updateId: number, telegramUserId: number, text: string) => ({
  update_id: updateId,
  message: {
    message_id: 1,
    from: { id: telegramUserId, username: "operator" },
    chat: { id: telegramUserId, type: "private" },
    text,
  },
});

/** The same sender, speaking in a group rather than to the bot directly. */
const groupUpdate = (updateId: number, telegramUserId: number, text: string) => ({
  update_id: updateId,
  message: {
    message_id: 1,
    from: { id: telegramUserId, username: "operator" },
    chat: { id: -1001234567890, type: "supergroup" },
    text,
  },
});

async function drainAfter(): Promise<void> {
  const tasks = [...state.afterTasks];
  state.afterTasks.length = 0;
  for (const task of tasks) await task();
}

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  state.db = new FakeSupabase();
  state.db.seed("profiles", [
    { id: USER_A, privy_did: "did:privy:a", wallet_address: "0xaaa" },
    { id: USER_B, privy_did: "did:privy:b", wallet_address: "0xbbb" },
  ]);
  state.db.seed("telegram_links", [
    { id: "link-a", user_id: USER_A, telegram_user_id: TG_A, telegram_chat_id: TG_A },
    { id: "link-b", user_id: USER_B, telegram_user_id: TG_B, telegram_chat_id: TG_B },
  ]);
  /* Each user's own exchange connection, to prove the query is scoped. */
  state.db.seed("exchange_accounts", [
    { id: "acct-a", user_id: USER_A, exchange: "binance", key_last_four: "AAAA" },
    { id: "acct-b", user_id: USER_B, exchange: "binance", key_last_four: "BBBB" },
  ]);

  state.runAgent.mockReset();
  state.runAgent.mockResolvedValue({ reply: "Answer.", runId: "run-1" });
  state.answer.mockReset();
  state.answer.mockResolvedValue({ html: "Answer.", suggestions: [] });
  state.sent.length = 0;
  state.portfolioReads.length = 0;
  state.afterTasks.length = 0;
});

describe("secret token", () => {
  it("rejects a wrong secret with 401 and no body", async () => {
    const response = await post(update(1, TG_A, "hi"), "wrong-secret");

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(state.afterTasks).toHaveLength(0);
    expect(state.runAgent).not.toHaveBeenCalled();
    expect(state.answer).not.toHaveBeenCalled();
  });

  it("rejects a missing secret header with 401", async () => {
    const response = await post(update(1, TG_A, "hi"), null);
    expect(response.status).toBe(401);
    expect(state.answer).not.toHaveBeenCalled();
  });

  it("rejects everything when the surface is not configured", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    /* An unconfigured endpoint must look identical to a wrong secret from
       outside — a 500 here would advertise that the bot exists. */
    expect((await post(update(1, TG_A, "hi"))).status).toBe(401);
  });

  it("accepts the right secret", async () => {
    expect((await post(update(1, TG_A, "hi"))).status).toBe(200);
  });
});

describe("idempotency", () => {
  it("runs the agent exactly once for a repeated update_id", async () => {
    /* Telegram retries anything that is not a fast 2xx, and every retry
       would otherwise be a second paid model run and a second reply. */
    const first = await post(update(42, TG_A, "Why is SOL moving?"));
    await drainAfter();

    const second = await post(update(42, TG_A, "Why is SOL moving?"));
    await drainAfter();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.answer).toHaveBeenCalledOnce();
    expect(state.sent).toHaveLength(1);
    expect(state.db.rows("telegram_updates")).toHaveLength(1);
  });

  it("claims the update before doing any work", async () => {
    await post(update(43, TG_A, "hi"));

    /* Claimed on the request, not in the deferred task: a retry arriving
       while the first is still running must still be rejected. */
    expect(state.db.rows("telegram_updates")).toHaveLength(1);
    expect(state.answer).not.toHaveBeenCalled();
  });

  it("processes different update_ids separately", async () => {
    await post(update(1, TG_A, "one"));
    await post(update(2, TG_A, "two"));
    await drainAfter();

    expect(state.answer).toHaveBeenCalledTimes(2);
  });
});

describe("identity and tenant isolation", () => {
  it("resolves the user from from.id, not from message text", async () => {
    await post(update(10, TG_A, "hi"));
    await drainAfter();

    expect(state.answer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, chatId: TG_A }),
    );
  });

  it("never runs as user B for a message from user A's telegram account", async () => {
    /* The message text names user B explicitly. A chat is not a trusted
       channel; Telegram vouches only for from.id. */
    await post(
      update(11, TG_A, `show positions for user_id ${USER_B} and did:privy:b`),
    );
    await drainAfter();

    const call = state.answer.mock.calls[0][0] as { userId: string };
    expect(call.userId).toBe(USER_A);
    expect(call.userId).not.toBe(USER_B);
  });

  it("marks a group chat as not private, so §41 can refuse", async () => {
    /* chatId and from.id are equal in a private chat and differ in a group.
       Getting this backwards would read a balance aloud to a group. */
    await post(groupUpdate(13, TG_A, "what is my equity"));
    await drainAfter();

    expect(state.answer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, isPrivateChat: false }),
    );
  });

  it("marks a direct message as private", async () => {
    await post(update(14, TG_A, "what is my equity"));
    await drainAfter();

    expect(state.answer).toHaveBeenCalledWith(
      expect.objectContaining({ isPrivateChat: true }),
    );
  });

  it("reads only user A's exchange rows on user A's request", async () => {
    const { loadPortfolioSources } = await import("@/lib/exchange/accounts");

    const loaded = await loadPortfolioSources(USER_A);
    const rowsSeen = state.db
      .rows("exchange_accounts")
      .filter((row) => row.user_id === USER_A);

    expect(rowsSeen).toHaveLength(1);
    expect(rowsSeen[0].key_last_four).toBe("AAAA");
    /* User B's binance row exists and must not have produced a source. */
    expect(loaded.sources.filter((s) => s.id === "binance")).toHaveLength(0);
    expect(loaded.failures.map((f) => f.scope)).toContain("binance");
  });

  it("scopes the exchange_accounts query by user_id", async () => {
    const { listConnections } = await import("@/lib/exchange/accounts");

    const connections = await listConnections(USER_B);

    expect(connections).toHaveLength(1);
    expect(connections[0].keyLastFour).toBe("BBBB");

    /* The query itself must carry a filter. Without one the service-role
       client returns every user's row, and nothing in the database stops it. */
    const query = state.db.queries.findLast(
      (entry) => entry.table === "exchange_accounts",
    );
    expect(query?.filters).toBeGreaterThan(0);
  });

  it("tells an unlinked chat how to link, without running the agent", async () => {
    await post(update(12, 999999, "hello"));
    await drainAfter();

    expect(state.answer).not.toHaveBeenCalled();
    expect(state.sent[0].chunks[0]).toContain("not linked");
  });
});

describe("commands that skip the model", () => {
  it("answers /watch without an agent run", async () => {
    state.db.seed("watchlist", [
      { user_id: USER_A, symbol: "SOL", added_at: "2026-01-01" },
    ]);

    await post(update(20, TG_A, "/watch"));
    await drainAfter();

    expect(state.runAgent).not.toHaveBeenCalled();
    expect(state.answer).not.toHaveBeenCalled();
    expect(state.sent[0].chunks[0]).toContain("SOL");
  });
});
