import "server-only";

import { requireFor } from "@/lib/env";
import { fetchJson } from "@/lib/market/http";

/* ---------------------------------------------------------------------------
   Talking to Telegram.

   Outbound sends are serialised per chat at one per second, which is
   Telegram's own limit for a single chat. Exceeding it earns a 429 with a
   retry_after, and a chunked reply is exactly the shape that trips it — four
   chunks fired together is four messages in one second.

   The queue is per server instance and lives only as long as the request
   that created it. That is the right scope for the case it exists to handle
   (one reply's chunks arriving in order, spaced out) and is not a global
   limiter across instances.
--------------------------------------------------------------------------- */

const API = "https://api.telegram.org";
const MIN_GAP_MS = 1_000;

function token(): string {
  return requireFor("TELEGRAM_BOT_TOKEN", "the Telegram surface");
}

async function call<T>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<T> {
  const payload = await fetchJson<{ ok: boolean; result: T; description?: string }>(
    {
      source: "telegram",
      url: `${API}/bot${token()}/${method}`,
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs,
    },
  );

  if (!payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? "unknown"}`);
  }
  return payload.result;
}

/* --- per-chat send queue ------------------------------------------------- */

const queues = new Map<number, Promise<unknown>>();

function enqueue<T>(chatId: number, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(chatId) ?? Promise.resolve();

  const next = previous
    /* The predecessor's failure must not cancel this send. */
    .catch(() => undefined)
    .then(async () => {
      const result = await task();
      await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));
      return result;
    });

  queues.set(chatId, next);

  /* Drop the entry once it is the tail, so the map does not grow forever in
     a long-lived instance. */
  void next.catch(() => undefined).finally(() => {
    if (queues.get(chatId) === next) queues.delete(chatId);
  });

  return next;
}

/* --- public surface ------------------------------------------------------ */

/**
 * Sends one already-formatted HTML chunk.
 *
 * `parse_mode: HTML` — never MarkdownV2, whose escaping rules break on
 * ordinary model output. See lib/agent/format/telegram.ts.
 */
export function sendMessage(
  chatId: number,
  html: string,
  options: { disablePreview?: boolean } = {},
): Promise<unknown> {
  return enqueue(chatId, () =>
    call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: options.disablePreview ?? true,
      },
    }),
  );
}

/** Sends every chunk of a reply, in order. */
export async function sendChunks(
  chatId: number,
  chunks: string[],
): Promise<void> {
  for (const chunk of chunks) {
    await sendMessage(chatId, chunk);
  }
}

/**
 * The "typing…" indicator.
 *
 * Not queued: it is a status ping, not a message, and putting it behind the
 * one-per-second message queue would delay the reply it exists to cover.
 */
export async function sendTyping(chatId: number): Promise<void> {
  try {
    await call("sendChatAction", { chat_id: chatId, action: "typing" }, 5_000);
  } catch {
    /* A missing typing indicator is not worth failing a run over. */
  }
}

/**
 * Keeps "typing…" alive for the length of a run.
 *
 * Telegram clears the indicator after about five seconds, so it is refreshed
 * every four. The returned function stops it, and must be called in a finally
 * or the interval outlives the request.
 */
export function startTypingHeartbeat(chatId: number): () => void {
  void sendTyping(chatId);
  const timer = setInterval(() => void sendTyping(chatId), 4_000);
  return () => clearInterval(timer);
}

/* ---------------------------------------------------------------------------
   Inline keyboards
--------------------------------------------------------------------------- */

export interface InlineButton {
  text: string;
  /** Opaque handle only — never an action or an amount. See lib/telegram/actions.ts. */
  callbackData?: string;
  url?: string;
}

/**
 * A message with buttons under it.
 *
 * Telegram caps `callback_data` at 64 bytes and rejects the whole keyboard
 * past it — silently, meaning the message arrives with no buttons and nobody
 * finds out until a user reports that nothing is tappable. Checked here, and
 * an over-long button is dropped rather than taking its whole row with it.
 */
export function sendMessageWithButtons(
  chatId: number,
  html: string,
  rows: InlineButton[][],
): Promise<unknown> {
  const keyboard = rows
    .map((row) =>
      row
        .filter((button) => {
          if (button.callbackData === undefined) return true;
          return Buffer.byteLength(button.callbackData, "utf8") <= 64;
        })
        .map((button) => ({
          text: button.text,
          ...(button.url === undefined ? {} : { url: button.url }),
          ...(button.callbackData === undefined
            ? {}
            : { callback_data: button.callbackData }),
        })),
    )
    .filter((row) => row.length > 0);

  return enqueue(chatId, () =>
    call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
  );
}

/**
 * Clears the spinner on a tapped button.
 *
 * Telegram shows a loading state until this is answered, and leaves it
 * spinning for a while if it never is. Not queued — it is a UI
 * acknowledgement with its own short deadline, and it must not wait behind a
 * message. Failing is not worth aborting the work it acknowledges.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await call(
      "answerCallbackQuery",
      {
        callback_query_id: callbackQueryId,
        ...(text === undefined ? {} : { text, show_alert: false }),
      },
      5_000,
    );
  } catch {
    /* The spinner clears on its own eventually. */
  }
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  /** Opaque. Whatever we put in the button, handed back verbatim. */
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
