import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { appUrl, optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Link-code issuance.

   Authenticated. The code is bound to the session's user id, so redeeming it
   in Telegram links that account and no other — the code is the only thing
   that crosses between the two surfaces, and it carries no identity of its
   own beyond this row.
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

  const botUsername = optional("TELEGRAM_BOT_USERNAME");
  if (optional("TELEGRAM_BOT_TOKEN") === undefined) {
    return NextResponse.json(
      { error: "The Telegram bot is not configured." },
      { status: 503 },
    );
  }

  const db = serviceClient();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

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

  const { data } = await serviceClient()
    .from("telegram_links")
    .select("telegram_username, linked_at")
    .eq("user_id", user.userId)
    .maybeSingle();

  return NextResponse.json({
    linked: data !== null && data !== undefined,
    username: data?.telegram_username ?? null,
    linkedAt: data?.linked_at ?? null,
  });
}
