import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Prepared actions and the Telegram confirmation boundary.

   THE rule under test: a Telegram tap is not a signature.

   Telegram authenticates a chat account. It says nothing about custody of a
   wallet, and an inline button is not a consent mechanism for moving money.
   Everything here exists so that adding a signing path later cannot
   accidentally turn a button into an authorisation.

   Second rule: the button carries an opaque handle, never the action. If the
   amount rides in callback_data then the amount is an input to the webhook
   rather than a fact the server established.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

const USER_A = "user-a";
const USER_B = "user-b";

const ACTION: PreparedAction = {
  id: "a1",
  kind: "swap",
  summary: "Swap 21.25 SOL to USDC",
  fields: [{ label: "Amount", value: "21.25 SOL", derived: true }],
  readiness: "ready",
  reason: null,
  warnings: [],
  preparedAt: "2026-09-16T00:00:00.000Z",
};

beforeEach(() => {
  state.db = new FakeSupabase();
});

async function store(userId = USER_A) {
  const { storePreparedAction } = await import("@/lib/telegram/actions");
  return storePreparedAction({ userId, action: ACTION, surface: "telegram" });
}

describe("callback data", () => {
  it("carries an opaque handle and nothing else", async () => {
    const { callbackDataFor } = await import("@/lib/telegram/actions");
    const record = await store();

    const data = callbackDataFor(record!.token);

    /* If any of these appear, the amount is an input to the webhook rather
       than something the server established and stored. */
    expect(data).not.toMatch(/21\.25|SOL|USDC|swap/i);
    expect(data).toBe(`action:${record!.token}`);
  });

  it("stays inside Telegram's 64-byte limit", async () => {
    const { callbackDataFor } = await import("@/lib/telegram/actions");
    const record = await store();

    /* Telegram rejects an over-long keyboard SILENTLY — the message arrives
       with no buttons and nobody finds out until a user reports it. */
    expect(Buffer.byteLength(callbackDataFor(record!.token), "utf8")).toBeLessThanOrEqual(64);
  });

  it("generates a different token every time", async () => {
    const first = await store();
    const second = await store();

    /* A token derived from the contents would be a guessable token, and
       guessing one would let a stranger's tap address someone else's action. */
    expect(first!.token).not.toBe(second!.token);
  });

  it("recognises only its own callbacks", async () => {
    const { tokenFromCallback } = await import("@/lib/telegram/actions");

    expect(tokenFromCallback("action:abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(tokenFromCallback("swap:SOL:USDC:21.25")).toBeNull();
    expect(tokenFromCallback("action:../../etc/passwd")).toBeNull();
    expect(tokenFromCallback("action:short")).toBeNull();
    expect(tokenFromCallback("")).toBeNull();
  });
});

describe("resolution is scoped to the caller", () => {
  it("resolves for the user it was prepared for", async () => {
    const { resolvePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);

    const found = await resolvePreparedAction(record!.token, USER_A);
    expect(found?.action.summary).toBe("Swap 21.25 SOL to USDC");
  });

  it("does not resolve someone else's token", async () => {
    /* The service-role client bypasses RLS, so this filter IS the tenant
       boundary. The token being unguessable is not a substitute for it. */
    const { resolvePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);

    expect(await resolvePreparedAction(record!.token, USER_B)).toBeNull();
  });

  it("answers the same way for an unknown token as for someone else's", async () => {
    const { resolvePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);

    /* Telling the two apart would confirm which handles exist. */
    expect(await resolvePreparedAction(record!.token, USER_B)).toBeNull();
    expect(await resolvePreparedAction("aaaaaaaaaaaaaaaaaaaa", USER_B)).toBeNull();
  });

  it("rejects a malformed token without querying", async () => {
    const { resolvePreparedAction } = await import("@/lib/telegram/actions");
    await store();
    const before = state.db.queries.length;

    expect(await resolvePreparedAction("'; drop table --", USER_A)).toBeNull();
    expect(state.db.queries.length).toBe(before);
  });
});

describe("expiry", () => {
  it("reports an expired action as expired rather than usable", async () => {
    const { resolvePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store();

    /* Enforced on read, not by a sweeper: a row that outlived its window is
       unusable whether or not anything cleaned up. */
    const row = state.db.rows("prepared_actions")[0];
    row.expires_at = new Date(Date.now() - 1000).toISOString();

    const found = await resolvePreparedAction(record!.token, USER_A);
    expect(found?.status).toBe("expired");
  });

  it("will not acknowledge an expired action", async () => {
    const { acknowledgePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store();

    state.db.rows("prepared_actions")[0].expires_at = new Date(Date.now() - 1).toISOString();

    /* A swap prepared against one price and tapped twenty minutes later is a
       different trade. */
    expect(await acknowledgePreparedAction(record!.token, USER_A)).toBe(false);
  });
});

describe("a tap acknowledges, it does not authorise", () => {
  it("moves the row to acknowledged, never to confirmed", async () => {
    const { acknowledgePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store();

    expect(await acknowledgePreparedAction(record!.token, USER_A)).toBe(true);

    const row = state.db.rows("prepared_actions")[0];
    /* `confirmed` would mean a person authorised moving money. Telegram
       cannot establish that, so this path must never write it. */
    expect(row.status).toBe("acknowledged");
    expect(row.status).not.toBe("confirmed");
  });

  it("is idempotent under a double tap", async () => {
    const { acknowledgePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store();

    /* Telegram redelivers callbacks, and people tap twice. */
    expect(await acknowledgePreparedAction(record!.token, USER_A)).toBe(true);
    expect(await acknowledgePreparedAction(record!.token, USER_A)).toBe(false);
  });

  it("will not acknowledge another user's action", async () => {
    const { acknowledgePreparedAction } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);

    expect(await acknowledgePreparedAction(record!.token, USER_B)).toBe(false);
    expect(state.db.rows("prepared_actions")[0].status).toBe("prepared");
  });
});

describe("handleCallback", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://elyra.test";
  });

  it("says nothing was sent, and why Telegram cannot confirm", async () => {
    const { callbackDataFor } = await import("@/lib/telegram/actions");
    const { handleCallback } = await import("@/lib/telegram/commands");
    const record = await store(USER_A);

    const reply = await handleCallback({
      userId: USER_A,
      data: callbackDataFor(record!.token),
    });

    expect(reply).toMatch(/nothing has been sent/i);
    /* The user has to understand WHY they are being sent elsewhere, or the
       redirect reads as the product being broken. */
    expect(reply).toMatch(/chat account is not a signature/i);
    expect(reply).toContain("https://elyra.test");
  });

  it("refuses a token belonging to another user", async () => {
    const { callbackDataFor } = await import("@/lib/telegram/actions");
    const { handleCallback } = await import("@/lib/telegram/commands");
    const record = await store(USER_A);

    const reply = await handleCallback({
      userId: USER_B,
      data: callbackDataFor(record!.token),
    });

    expect(reply).toMatch(/no longer available/i);
    /* Not one word about what the action was. */
    expect(reply).not.toMatch(/21\.25|SOL|swap/i);
  });

  it("explains an expired preview rather than silently failing", async () => {
    const { callbackDataFor } = await import("@/lib/telegram/actions");
    const { handleCallback } = await import("@/lib/telegram/commands");
    const record = await store(USER_A);

    state.db.rows("prepared_actions")[0].expires_at = new Date(Date.now() - 1).toISOString();

    const reply = await handleCallback({
      userId: USER_A,
      data: callbackDataFor(record!.token),
    });

    expect(reply).toMatch(/expired/i);
  });

  it("ignores a hand-crafted callback that is not one of ours", async () => {
    const { handleCallback } = await import("@/lib/telegram/commands");

    /* The attack the opaque-token design exists to defeat. */
    const reply = await handleCallback({
      userId: USER_A,
      data: "swap:SOL:USDC:1000000",
    });

    expect(reply).toMatch(/no longer valid/i);
    expect(state.db.rows("prepared_actions")).toHaveLength(0);
  });
});

describe("notification dedupe", () => {
  it("lets exactly one caller claim a given alert", async () => {
    const { claimNotification } = await import("@/lib/telegram/notifications");

    /* A unique constraint, not a check-then-insert: two workers racing on the
       same alert both pass a "has this been sent?" read. */
    expect(await claimNotification(USER_A, "liquidation", "pos-1:0.9")).toBe(true);
    expect(await claimNotification(USER_A, "liquidation", "pos-1:0.9")).toBe(false);
  });

  it("scopes the claim per user", async () => {
    const { claimNotification } = await import("@/lib/telegram/notifications");

    expect(await claimNotification(USER_A, "liquidation", "pos-1:0.9")).toBe(true);
    expect(await claimNotification(USER_B, "liquidation", "pos-1:0.9")).toBe(true);
  });
});

describe("notification preferences", () => {
  it("returns everything off when there is no row", async () => {
    const { notificationPreferences } = await import("@/lib/telegram/notifications");
    const preferences = await notificationPreferences(USER_A);

    /* Linking a chat is consent to ASK questions, not consent to be told
       things. A missing row means send nothing. */
    expect(preferences.priceAlerts).toBe(false);
    expect(preferences.liquidationAlerts).toBe(false);
    expect(preferences.largeMoves).toBe(false);
    expect(preferences.dailySummary).toBe(false);
  });

  it("does not reset the other flags when one is changed", async () => {
    const { notificationPreferences, savePreferences } = await import(
      "@/lib/telegram/notifications"
    );

    await savePreferences(USER_A, { liquidationAlerts: true, dailySummary: true });
    await savePreferences(USER_A, { priceAlerts: true });

    /* A partial upsert REPLACES the row on conflict, which would silently
       turn off the daily summary when someone enables price alerts. */
    const preferences = await notificationPreferences(USER_A);
    expect(preferences.priceAlerts).toBe(true);
    expect(preferences.liquidationAlerts).toBe(true);
    expect(preferences.dailySummary).toBe(true);
  });
});

describe("the web's side: open actions", () => {
  it("lists only this user's prepared or acknowledged, unexpired actions", async () => {
    const { acknowledgePreparedAction, cancelPreparedAction, listOpenActions } = await import(
      "@/lib/telegram/actions"
    );
    const prepared = await store(USER_A);
    const acknowledged = await store(USER_A);
    const cancelled = await store(USER_A);
    await store(USER_B);
    await acknowledgePreparedAction(acknowledged!.token, USER_A);
    await cancelPreparedAction(cancelled!.token, USER_A);

    const open = await listOpenActions(USER_A);
    expect(open.map((entry) => entry.id).sort()).toEqual([prepared!.id, acknowledged!.id].sort());
    expect(open.every((entry) => entry.userId === USER_A)).toBe(true);
  });

  it("leaves out an action whose window has passed", async () => {
    const { listOpenActions } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);
    state.db.rows("prepared_actions")[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(record).not.toBeNull();
    expect(await listOpenActions(USER_A)).toEqual([]);
  });

  it("settles an open action once, and never another user's", async () => {
    const { settleOpenAction } = await import("@/lib/telegram/actions");
    const record = await store(USER_A);

    expect(await settleOpenAction(record!.id, USER_B, "cancelled")).toBe(false);
    expect(state.db.rows("prepared_actions")[0].status).toBe("prepared");

    expect(await settleOpenAction(record!.id, USER_A, "confirmed")).toBe(true);
    expect(state.db.rows("prepared_actions")[0].status).toBe("confirmed");

    /* Settled rows are closed: a second write changes nothing. */
    expect(await settleOpenAction(record!.id, USER_A, "cancelled")).toBe(false);
    expect(state.db.rows("prepared_actions")[0].status).toBe("confirmed");
  });
});
