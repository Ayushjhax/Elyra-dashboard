import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { optional } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Telegram Mini App initData — verified, server-side, every time.

   ── The rule ───────────────────────────────────────────────────────────

   NEVER TRUST `initDataUnsafe`.

   The Telegram WebApp SDK exposes two things: `initData`, a signed query
   string, and `initDataUnsafe`, the same fields already parsed into an
   object. The second is named the way it is for a reason — it is whatever the
   page was loaded with. A Mini App is an ordinary web page in an ordinary
   webview, and anyone can open its URL with a hand-written hash fragment.
   Reading `initDataUnsafe.user.id` and looking up that account is an
   authentication bypass with a convenient API.

   So the client sends the RAW `initData` string and this verifies it here,
   with the bot token, which the browser never sees.

   ── The algorithm, and the one thing everyone gets wrong ───────────────

   Telegram's scheme is:

     secret  = HMAC_SHA256(key = "WebAppData", message = <bot token>)
     check   = HMAC_SHA256(key = secret,       message = <data_check_string>)

   The bot token is the MESSAGE and the literal "WebAppData" is the KEY. Those
   are the opposite way round from every other HMAC in a codebase, and getting
   them backwards produces a verifier that rejects every real request — or
   worse, one that a determined attacker can forge against.

   `data_check_string` is every field except `hash`, sorted by key, joined as
   `k=v` with newlines.

   ── Freshness ──────────────────────────────────────────────────────────

   A valid signature is valid forever. `auth_date` is checked so a captured
   initData string — out of a shared screenshot, a proxy log, a browser
   history — cannot be replayed a week later.
--------------------------------------------------------------------------- */

/** Telegram recommends an hour; a Mini App session is far shorter. */
const MAX_AGE_SECONDS = 3600;

export interface VerifiedInitData {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  /** When Telegram signed this, as an ISO string. */
  authAt: string;
}

export type InitDataFailure =
  | "unconfigured"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "no_user";

export type InitDataResult =
  | { ok: true; data: VerifiedInitData }
  | { ok: false; reason: InitDataFailure };

function botToken(): string | undefined {
  const raw = optional("TELEGRAM_BOT_TOKEN")?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

/**
 * Verifies a raw initData string.
 *
 * Returns a reason rather than throwing, so a caller can distinguish "this
 * surface is not configured" from "this request is forged" — the first is an
 * operator problem and the second is an attack.
 */
export function verifyInitData(
  initData: string,
  nowMs: number = Date.now(),
): InitDataResult {
  const token = botToken();
  if (token === undefined) return { ok: false, reason: "unconfigured" };
  if (typeof initData !== "string" || initData.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (hash === null || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { ok: false, reason: "malformed" };
  }

  /* Every field except `hash`, sorted by key, joined `k=v` with newlines. */
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  /* The token is the MESSAGE; "WebAppData" is the KEY. Not the other way. */
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();

  const presented = Buffer.from(hash, "hex");
  if (presented.length !== expected.length) return { ok: false, reason: "bad_signature" };
  /* Constant time: a byte-by-byte compare leaks the prefix through timing,
     and a forgeable signature is the whole ballgame. */
  if (!timingSafeEqual(presented, expected)) return { ok: false, reason: "bad_signature" };

  const authDate = Number.parseInt(params.get("auth_date") ?? "", 10);
  if (!Number.isFinite(authDate)) return { ok: false, reason: "malformed" };

  const ageSeconds = Math.floor(nowMs / 1000) - authDate;
  /* Both directions. A far-future auth_date is not a clock skew problem, it
     is a forged one, and accepting it would make the window unbounded. */
  if (ageSeconds > MAX_AGE_SECONDS || ageSeconds < -MAX_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  const rawUser = params.get("user");
  if (rawUser === null) return { ok: false, reason: "no_user" };

  let user: { id?: unknown; username?: unknown; first_name?: unknown };
  try {
    user = JSON.parse(rawUser) as typeof user;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof user.id !== "number" || !Number.isFinite(user.id)) {
    return { ok: false, reason: "no_user" };
  }

  return {
    ok: true,
    data: {
      telegramUserId: user.id,
      username: typeof user.username === "string" ? user.username : null,
      firstName: typeof user.first_name === "string" ? user.first_name : null,
      authAt: new Date(authDate * 1000).toISOString(),
    },
  };
}
