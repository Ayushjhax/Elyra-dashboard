import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser, hasProfile, profileUnavailable } from "@/lib/auth/session";
import { appUrl, optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Link-code issuance, link status, and unlinking from the web.

   Authenticated. The code is bound to the session's user id, so redeeming it
   in Telegram links that account and no other — the code is the only thing
   that crosses between the two surfaces, and it carries no identity of its
   own beyond this row.

   An account has at most one live code. Issuing a new one revokes any the
   account still holds unredeemed, so a code left on another screen — or one
   read over a shoulder — stops working the moment it is replaced, rather
   than at the end of its window.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";

/**
 * I, O, 0 and 1 are excluded. A code is read off a screen and typed into a
 * phone, and those four are the pairs people get wrong.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const TTL_MINUTES = 10;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    /* randomInt, not Math.random: this is a bearer credential for the length
       of its ten-minute window. */
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /* The code IS a row — it is issued by writing it, and redeemed by reading
     it back from the other surface. There is no version of this that works
     without the table. */
  if (!hasProfile(user)) return profileUnavailable("Telegram linking");

  const botUsername = optional("TELEGRAM_BOT_USERNAME");
  if (optional("TELEGRAM_BOT_TOKEN") === undefined) {
    return NextResponse.json(
      { error: "The Telegram bot is not configured." },
      { status: 503 },
    );
  }

  const db = serviceClient();

  /* Revoked BEFORE the new code exists. Two requests racing can then at worst
     leave two codes for the same account; revoking afterwards could leave
     none. A revocation that fails issues nothing, because the promise on
     screen is that the old code no longer works. Redeemed rows are kept. */
  const revoked = await db
    .from("telegram_link_codes")
    .delete()
    .eq("user_id", user.userId)
    .is("consumed_at", null);
  if (revoked.error) {
    console.error("[telegram/link] revoke", revoked.error.code, revoked.error.message);
    return NextResponse.json(
      { error: "Could not replace your previous code. Try again." },
      { status: 500 },
    );
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + TTL_MINUTES * 60_000);

  /* Retry on the vanishingly unlikely collision with a live code rather than
     handing back one that already belongs to someone else. */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const { error } = await db.from("telegram_link_codes").insert({
      code,
      user_id: user.userId,
      expires_at: expiresAt.toISOString(),
    });

    if (error === null) {
      return NextResponse.json({
        code,
        /* Both ends of the window on the server's clock, so a client can
           count down the code's real lifetime without trusting its own clock
           to agree with this one. */
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        deepLink:
          botUsername === undefined
            ? null
            : `https://t.me/${botUsername}?start=${code}`,
        botUsername: botUsername ?? null,
        appUrl: appUrl(),
      });
    }

    /* 23505 is a collision; anything else is a real failure. */
    if (error.code !== "23505") {
      console.error("[telegram/link]", error);
      return NextResponse.json(
        { error: "Could not issue a code." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Could not issue a code. Try again." },
    { status: 500 },
  );
}

/** Whether this account already has a linked chat, for the dashboard control. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /* A status read, not an action. With no row to consult, the honest answer
     is "not linked, and here is why we cannot tell" — reported at 200 with a
     reason rather than as an error, because the status bar renders this on
     every page and a 503 there would read as the app being down. */
  if (!hasProfile(user)) {
    return NextResponse.json({
      linked: false,
      username: null,
      linkedAt: null,
      botUsername: optional("TELEGRAM_BOT_USERNAME") ?? null,
      unavailable: "Link status could not be read: the database is unreachable.",
    });
  }

  const { data } = await serviceClient()
    .from("telegram_links")
    .select("telegram_username, linked_at")
    .eq("user_id", user.userId)
    .maybeSingle();

  return NextResponse.json({
    linked: data !== null && data !== undefined,
    username: data?.telegram_username ?? null,
    linkedAt: data?.linked_at ?? null,
    /* The bot's own handle, so a client can build a t.me link without a
       second round trip. Additive and leaks nothing: POST already returns it
       inside `deepLink`, and a bot handle is public by construction. Null
       when Telegram is not configured, which is how the status bar knows to
       show the control as unavailable rather than broken. */
    botUsername: optional("TELEGRAM_BOT_USERNAME") ?? null,
  });
}

/**
 * Unlinks every Telegram chat from this account, from the web.
 *
 * The same effect as /unlink in the chat, for someone who no longer has the
 * chat — a lost phone, a shared device. Outstanding codes go with it, so
 * unlinking cannot be undone by a code issued a minute earlier.
 *
 * Each chat is told, best effort: the link is removed whether or not the
 * message arrives, because a person who asked to cut access should not have
 * it depend on Telegram being reachable.
 */
export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!hasProfile(user)) return profileUnavailable("Unlinking Telegram");

  const db = serviceClient();

  /* Scoped to the caller: without the user_id filter this would unlink any
     account's chats. */
  const { data: chats } = await db
    .from("telegram_links")
    .select("telegram_chat_id")
    .eq("user_id", user.userId);

  const removed = await db.from("telegram_links").delete().eq("user_id", user.userId);
  if (removed.error) {
    console.error("[telegram/link] unlink", removed.error.code, removed.error.message);
    return NextResponse.json(
      { error: "Could not unlink Telegram. The chat is still linked." },
      { status: 500 },
    );
  }

  await db.from("telegram_link_codes").delete().eq("user_id", user.userId).is("consumed_at", null);

  if (optional("TELEGRAM_BOT_TOKEN") !== undefined) {
    await Promise.allSettled(
      (chats ?? []).map((chat) =>
        sendMessage(
          Number(chat.telegram_chat_id),
          "Unlinked from the Elyra web app. This chat no longer has access to your account.",
        ),
      ),
    );
  }

  return NextResponse.json({ linked: false });
}
