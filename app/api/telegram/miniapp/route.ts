import { NextResponse } from "next/server";
import { executeTool } from "@/lib/agent/tools/registry";
import { serviceClient } from "@/lib/supabase/server";
import { verifyInitData, type InitDataFailure } from "@/lib/telegram/initdata";

/* ---------------------------------------------------------------------------
   The Mini App's data endpoint.

   Authentication is the raw `initData` string, verified here with the bot
   token. The browser never sees that token and the page never decides who it
   is — it sends what Telegram signed and this says who that is.

   There is no separate Telegram account system. `telegram_links` maps a
   verified Telegram id to an existing Elyra profile, and a Telegram user who
   has not linked gets an instruction, never an implicitly created account.
   That is deliberate: an auto-created account would be a second identity for
   the same person, with its own memories, its own conversations and no wallet.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One message per failure. The reason is logged, not returned. */
const REJECTION: Record<InitDataFailure, { status: number; error: string }> = {
  unconfigured: { status: 503, error: "The Telegram surface is not configured." },
  malformed: { status: 401, error: "Could not verify this session." },
  bad_signature: { status: 401, error: "Could not verify this session." },
  expired: { status: 401, error: "This session has expired. Reopen Elyra from the chat." },
  no_user: { status: 401, error: "Could not verify this session." },
};

export async function POST(request: Request): Promise<Response> {
  let body: { initData?: unknown; view?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const initData = typeof body.initData === "string" ? body.initData : "";
  const verified = verifyInitData(initData);

  if (!verified.ok) {
    /* "Bad signature" and "expired" are told apart in the log, so a spike in
       the first is visible as what it is — an attempt, not a stale tab. */
    if (verified.reason === "bad_signature") {
      console.warn(JSON.stringify({ event: "miniapp-bad-signature" }));
    }
    const rejection = REJECTION[verified.reason];
    return NextResponse.json({ error: rejection.error }, { status: rejection.status });
  }

  const { data: link } = await serviceClient()
    .from("telegram_links")
    .select("user_id, profiles(wallet_address, solana_address, polymarket_address)")
    .eq("telegram_user_id", verified.data.telegramUserId)
    .maybeSingle();

  if (!link) {
    return NextResponse.json(
      {
        linked: false,
        /* Not an error. An unlinked Telegram account is a normal state with a
           next step, and rendering it as a failure hides the next step. */
        message:
          "This Telegram account is not linked to Elyra yet. Open Elyra on the " +
          "web, use Connect Telegram, and send the code to the bot.",
      },
      { status: 200 },
    );
  }

  const profile = link.profiles as unknown as
    | {
        wallet_address: string | null;
        solana_address: string | null;
        polymarket_address: string | null;
      }
    | null;

  const context = {
    userId: link.user_id,
    sessionWallet: profile?.wallet_address ?? null,
    solanaAddress: profile?.solana_address ?? null,
    polymarketAddress: profile?.polymarket_address ?? null,
  };

  const view = typeof body.view === "string" ? body.view : "portfolio";

  /* An allowlist, not a pass-through. `view` comes from the client and a
     string that reaches `executeTool` unchecked would let the page call any
     registered tool, including ones the Mini App has no business calling. */
  const TOOL: Record<string, string> = {
    portfolio: "portfolio_overview",
    holdings: "portfolio_holdings",
    risk: "portfolio_risk",
    defi: "defi_positions",
    prediction: "prediction_get_portfolio_summary",
    "prediction-positions": "prediction_get_positions",
    "prediction-trending": "prediction_get_trending",
  };

  const tool = TOOL[view];
  if (tool === undefined) {
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  }

  const outcome = await executeTool(tool, {}, context);

  return NextResponse.json(
    { linked: true, view, data: outcome.result },
    {
      status: 200,
      /* Per-user data behind a signed session. Nothing may cache it. */
      headers: { "cache-control": "no-store" },
    },
  );
}
