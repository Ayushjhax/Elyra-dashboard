import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

/* ---------------------------------------------------------------------------
   Mini App authentication.

   This is the single highest-value test file in the Telegram surface. A Mini
   App is an ordinary web page in an ordinary webview: anyone can open its URL
   with a hand-written hash fragment. If this verifier can be fooled, every
   balance in the product is readable by anyone who can guess a numeric id.
--------------------------------------------------------------------------- */

const TOKEN = "123456:test-bot-token-not-a-real-credential";

/** Signs initData exactly as Telegram does, so the fixture is real. */
function signInitData(
  fields: Record<string, string>,
  token = TOKEN,
): string {
  const pairs = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");

  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const NOW = 1_789_500_000_000;
const AUTH_DATE = String(Math.floor(NOW / 1000));
const USER = JSON.stringify({ id: 111111, username: "operator", first_name: "A" });

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("verifyInitData", () => {
  it("accepts a correctly signed payload", async () => {
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const result = verifyInitData(signInitData({ auth_date: AUTH_DATE, user: USER }), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.telegramUserId).toBe(111111);
      expect(result.data.username).toBe("operator");
    }
  });

  it("rejects an unsigned payload that names a user", async () => {
    /* THE attack. Open the Mini App URL by hand, claim to be user 111111.
       Without a signature check this returns someone else's portfolio. */
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const forged = new URLSearchParams({
      auth_date: AUTH_DATE,
      user: USER,
      hash: "0".repeat(64),
    }).toString();

    const result = verifyInitData(forged, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects a payload signed with a different bot token", async () => {
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const signed = signInitData({ auth_date: AUTH_DATE, user: USER }, "999:someone-elses-bot");

    const result = verifyInitData(signed, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects a payload whose user was swapped after signing", async () => {
    /* The signature covers the data_check_string, so editing any field
       invalidates it. This proves the check string is actually built from the
       payload rather than from a fixed list of fields. */
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const signed = signInitData({ auth_date: AUTH_DATE, user: USER });
    const params = new URLSearchParams(signed);
    params.set("user", JSON.stringify({ id: 222222, username: "victim" }));

    const result = verifyInitData(params.toString(), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects a replayed payload from last week", async () => {
    /* A valid signature is valid forever. Without this, an initData string
       captured from a screenshot or a proxy log works indefinitely. */
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const old = String(Math.floor(NOW / 1000) - 7 * 24 * 3600);
    const signed = signInitData({ auth_date: old, user: USER });

    const result = verifyInitData(signed, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a far-future auth_date", async () => {
    /* Not clock skew — a forged timestamp. Accepting it makes the replay
       window unbounded in the other direction. */
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const future = String(Math.floor(NOW / 1000) + 7 * 24 * 3600);
    const signed = signInitData({ auth_date: future, user: USER });

    const result = verifyInitData(signed, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("distinguishes an unconfigured surface from a forged request", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { verifyInitData } = await import("@/lib/telegram/initdata");

    /* One is an operator problem, the other is an attack. Logging them the
       same way means never noticing the second. */
    const result = verifyInitData(signInitData({ auth_date: AUTH_DATE, user: USER }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unconfigured");
  });

  it("rejects a signed payload carrying no user", async () => {
    const { verifyInitData } = await import("@/lib/telegram/initdata");
    const result = verifyInitData(signInitData({ auth_date: AUTH_DATE }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_user");
  });

  it("rejects malformed input without throwing", async () => {
    const { verifyInitData } = await import("@/lib/telegram/initdata");

    for (const input of ["", "not-a-query-string", "hash=short", "user=%7B"]) {
      const result = verifyInitData(input, NOW);
      expect(result.ok).toBe(false);
    }
  });

  it("uses the bot token as the message and WebAppData as the key", async () => {
    /* The ordering everyone gets backwards. This test fails loudly if someone
       "fixes" the HMAC to the more intuitive arrangement. */
    const { verifyInitData } = await import("@/lib/telegram/initdata");

    const pairs = [`auth_date=${AUTH_DATE}`, `user=${USER}`].sort();
    const backwards = createHmac("sha256", TOKEN).update("WebAppData").digest();
    const wrongHash = createHmac("sha256", backwards).update(pairs.join("\n")).digest("hex");

    const params = new URLSearchParams({ auth_date: AUTH_DATE, user: USER });
    params.set("hash", wrongHash);

    const result = verifyInitData(params.toString(), NOW);
    expect(result.ok).toBe(false);
  });
});
