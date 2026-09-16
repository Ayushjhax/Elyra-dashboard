import { after, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto/credentials";
import { optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";
import { answerCallbackQuery, sendMessage, type TelegramUpdate } from "@/lib/telegram/api";
import {
  handleCallback,
  handleCommand,
  handleUnlinked,
  respond,
} from "@/lib/telegram/commands";

/* ---------------------------------------------------------------------------
   The Telegram surface.

   Order matters here more than anywhere else in the app:

     1. Check the secret header. A mismatch is 401 with no body.
     2. Claim the update_id. A duplicate means Telegram retried; stop.
     3. Return 200 *now*. The agent run happens after the response.

   Telegram retries anything that is not a fast 2xx, and an agent run takes
   seconds. Doing the work before responding guarantees a retry, and every
   retry is a second paid model run producing a second reply to the same
   message. Steps 2 and 3 exist entirely to prevent that.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";

/** No body on a rejection: nothing to learn from probing this endpoint. */
const UNAUTHORIZED = new NextResponse(null, { status: 401 });

/** Telegram only needs a 200; it ignores the body. */
const ACK = new NextResponse(null, { status: 200 });

export async function POST(request: Request) {
  const expected = optional("TELEGRAM_WEBHOOK_SECRET");
  if (expected === undefined) {
    /* The surface is not configured. 401 rather than 500: an unconfigured
       endpoint should look identical to a wrong secret from outside. */
    return UNAUTHORIZED;
  }

  const presented = request.headers.get("x-telegram-bot-api-secret-token");
  if (presented === null || !safeEqual(presented, expected)) {
    return UNAUTHORIZED;
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    /* Malformed body from something holding a valid secret. Acknowledge so
       Telegram stops retrying it. */
    return ACK;
  }

  if (typeof update.update_id !== "number") return ACK;

  const db = serviceClient();

  /* Insert-then-ignore-conflict. The select returns the row only when this
     call is the one that inserted it, so an empty result is proof another
     delivery of the same update already claimed it. */
  const claim = await db
    .from("telegram_updates")
    .upsert(
      { update_id: update.update_id },
      { onConflict: "update_id", ignoreDuplicates: true },
    )
    .select("update_id");

  if (claim.error) {
    /* Could not establish whether this is a retry. Acknowledging risks
       dropping a message; retrying risks a duplicate paid run. Dropping one
       message is the cheaper mistake and the one the user can correct by
       asking again. */
    console.error("[telegram] idempotency claim failed", claim.error);
    return ACK;
  }

  if ((claim.data ?? []).length === 0) return ACK;

  /* ---- A tapped button ----

     Routed before messages because a callback carries no `message.text` and
     would otherwise fall through as an empty update. Identity is resolved the
     same way: from `from.id`, never from the payload the button handed back. */
  const callback = update.callback_query;
  if (callback !== undefined) {
    const data = callback.data;
    if (data === undefined || data.length === 0) return ACK;

    after(async () => {
      try {
        await processCallback({
          callbackQueryId: callback.id,
          chatId: callback.message?.chat.id ?? callback.from.id,
          telegramUserId: callback.from.id,
          data,
        });
      } catch (error) {
        console.error("[telegram] callback failed", error);
      }
    });

    return ACK;
  }

  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const from = message?.from;

  if (!message || !from || text === undefined || text.length === 0) return ACK;

  /* Everything below runs after the response is sent. */
  after(async () => {
    try {
      await process({
        chatId: message.chat.id,
        telegramUserId: from.id,
        telegramUsername: from.username ?? null,
        text,
      });
    } catch (error) {
      console.error("[telegram] processing failed", error);
    }
  });

  return ACK;
}

/**
 * Resolves the Elyra account a Telegram account is linked to.
 *
 * `telegram_user_id` is what Telegram vouches for. Nothing else in an update
 * is trustworthy for identity — not the chat id, not the username, and
 * certainly not anything in the message body.
 */
async function linkedAccount(telegramUserId: number): Promise<{
  userId: string;
  walletAddress: string | null;
  solanaAddress: string | null;
  polymarketAddress: string | null;
} | null> {
  const { data } = await serviceClient()
    .from("telegram_links")
    .select("user_id, profiles(wallet_address, solana_address, polymarket_address)")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (!data) return null;

  const profile = data.profiles as unknown as
    | {
        wallet_address: string | null;
        solana_address: string | null;
        polymarket_address: string | null;
      }
    | null;

  return {
    userId: data.user_id,
    walletAddress: profile?.wallet_address ?? null,
    solanaAddress: profile?.solana_address ?? null,
    polymarketAddress: profile?.polymarket_address ?? null,
  };
}

async function processCallback(input: {
  callbackQueryId: string;
  chatId: number;
  telegramUserId: number;
  data: string;
}): Promise<void> {
  /* Clear the spinner first. Telegram leaves the button loading until this is
     answered, and the work below can take a round trip to the database. */
  await answerCallbackQuery(input.callbackQueryId);

  const account = await linkedAccount(input.telegramUserId);
  if (account === null) {
    await sendMessage(input.chatId, "This chat is not linked to an Elyra account.");
    return;
  }

  /* `respond` handles both shapes — a plain string and a reply carrying
     inline buttons — so prediction navigation can render its own keyboard
     without a second send path. */
  await respond(input.chatId, async () => {
    const reply = await handleCallback({
      userId: account.userId,
      data: input.data,
      sessionWallet: account.walletAddress,
      solanaAddress: account.solanaAddress,
      polymarketAddress: account.polymarketAddress,
    });
    return typeof reply === "string" ? [reply] : reply;
  });
}

async function process(input: {
  chatId: number;
  telegramUserId: number;
  telegramUsername: string | null;
  text: string;
}): Promise<void> {
  /* Identity comes from `from.id`, which Telegram asserts, resolved against
     telegram_links. Never from message text: a chat is not a trusted channel,
     and anything typed into it is asserted by a stranger. */
  const link = await linkedAccount(input.telegramUserId);

  if (link === null) {
    await respond(input.chatId, () =>
      handleUnlinked({
        text: input.text,
        telegramUserId: input.telegramUserId,
        telegramChatId: input.chatId,
        telegramUsername: input.telegramUsername,
      }),
    );
    return;
  }

  await respond(input.chatId, () =>
    handleCommand({
      userId: link.userId,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      text: input.text,
      sessionWallet: link.walletAddress,
      solanaAddress: link.solanaAddress,
      polymarketAddress: link.polymarketAddress,
    }),
  );
}
