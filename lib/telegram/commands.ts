import "server-only";

import { ensureConversation, runAgent, UsageLimitError } from "@/lib/agent";
import { formatForTelegram } from "@/lib/agent/format/telegram";
import { reportPrompt } from "@/lib/agent/prompt";
import { normaliseSymbol } from "@/lib/agent/tools/args";
import { executeTool, type ToolContext } from "@/lib/agent/tools/registry";
import { appUrl, optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";
import { sendChunks, startTypingHeartbeat } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Telegram commands.

   `userId` here is always resolved from `message.from.id` against
   telegram_links, by the webhook, before anything in this file runs. Nothing
   below takes a user identifier from message text — a chat is not a trusted
   channel, and Telegram only vouches for `from.id`.
--------------------------------------------------------------------------- */

const HELP = [
  "<b>Elyra</b> — read-only market and portfolio analysis.",
  "",
  "Ask anything in plain language, or use:",
  "",
  "<b>/ask</b> &lt;question&gt; — same as just typing",
  "<b>/report</b> [symbol] — a short report on a symbol, or your account",
  "<b>/positions</b> — your open positions, no model call",
  "<b>/watch</b> — your watchlist, no model call",
  "<b>/unlink</b> — disconnect this chat",
  "<b>/help</b> — this message",
  "",
  "I read data and write analysis. I cannot place, change or cancel an order.",
].join("\n");

function linkInstructions(): string {
  const username = optional("TELEGRAM_BOT_USERNAME");
  return [
    "<b>This chat is not linked to an Elyra account.</b>",
    "",
    `Open ${escapeText(appUrl())}, use <b>Connect Telegram</b> on the dashboard,`,
    "then send the six-character code here:",
    "",
    "<code>/link ABC234</code>",
    "",
    username === undefined
      ? ""
      : `You can also use the deep link the dashboard shows for @${escapeText(username)}.`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

/* ------------------------------------------------------------------------- */

/** What the webhook hands to a command. */
export interface CommandInput {
  userId: string;
  chatId: number;
  /* The Telegram account, which is what telegram_links is keyed on. Distinct
     from chatId: they are equal in a private chat and differ in a group. */
  telegramUserId: number;
  text: string;
  sessionWallet: string | null;
}

/** Splits "/report SOL" into its parts, ignoring an @botname suffix. */
export function parseCommand(text: string): {
  command: string | null;
  argument: string;
} {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { command: null, argument: trimmed };

  const match = /^\/([a-zA-Z0-9_]+)(?:@\S+)?\s*([\s\S]*)$/.exec(trimmed);
  if (match === null) return { command: null, argument: trimmed };

  return { command: match[1].toLowerCase(), argument: match[2].trim() };
}

/* --- commands that need no model call ------------------------------------ */

async function positions(input: CommandInput): Promise<string[]> {
  const context: ToolContext = {
    userId: input.userId,
    sessionWallet: input.sessionWallet,
  };

  const outcome = await executeTool("get_positions", {}, context);
  const data = outcome.result as {
    positions?: Array<{
      label: string;
      side: string;
      size: number;
      markPrice: number;
      unrealizedPnl: number | null;
      notional: number;
      exchange: string;
    }>;
    unreadable?: Array<{ scope: string; reason: string }>;
    error?: string;
  };

  if (data.error !== undefined) {
    return [`<b>Could not read positions.</b>\n${escapeText(data.error)}`];
  }

  const rows = data.positions ?? [];
  const lines: string[] = [];

  if (rows.length === 0) {
    lines.push("No open positions.");
  } else {
    lines.push(`<b>Open positions (${rows.length})</b>`, "");
    for (const row of rows) {
      const pnl =
        row.unrealizedPnl === null
          ? ""
          : `\n  PnL: ${money(row.unrealizedPnl)}`;
      lines.push(
        `<b>${escapeText(row.label)}</b> · ${escapeText(row.side)}`,
        `  Size: ${row.size} @ ${row.markPrice}`,
        `  Notional: ${money(row.notional)}${pnl}`,
        `  Venue: ${escapeText(row.exchange)}`,
        "",
      );
    }
  }

  /* Never present a partial portfolio as a complete one. */
  for (const failure of data.unreadable ?? []) {
    lines.push(
      `<i>${escapeText(failure.scope)} could not be read: ${escapeText(failure.reason)}</i>`,
    );
  }

  return formatChunks(lines.join("\n"));
}

async function watchlist(input: CommandInput): Promise<string[]> {
  const outcome = await executeTool(
    "get_watchlist",
    {},
    { userId: input.userId, sessionWallet: input.sessionWallet },
  );
  const data = outcome.result as { symbols?: string[]; error?: string };

  if (data.error !== undefined) {
    return [`<b>Could not read watchlist.</b>\n${escapeText(data.error)}`];
  }

  const symbols = data.symbols ?? [];
  return symbols.length === 0
    ? ["Your watchlist is empty."]
    : [
        `<b>Watchlist</b>\n${symbols.map((s) => `• ${escapeText(s)}`).join("\n")}`,
      ];
}

/** Already-HTML text, chunked without going through the markdown pass. */
function formatChunks(html: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of html.split(/\n{2,}/)) {
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length > 4000) {
      if (current.length > 0) chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [html];
}

/* --- linking ------------------------------------------------------------- */

/** A wrong, expired or spent code all give the same answer. */
const LINK_FAILED =
  "That code did not work. Codes expire after ten minutes and can only be " +
  "used once — generate a new one from the dashboard.";

export async function linkChat(options: {
  code: string;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername: string | null;
}): Promise<string> {
  const code = options.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return LINK_FAILED;

  const db = serviceClient();

  const { data: row, error } = await db
    .from("telegram_link_codes")
    .select("code, user_id, expires_at, consumed_at")
    .eq("code", code)
    .maybeSingle();

  /* One message for every failure mode. Distinguishing "expired" from
     "already used" from "no such code" would confirm which codes exist, and
     the space is only 32^6. */
  if (error || !row) return LINK_FAILED;
  if (row.consumed_at !== null) return LINK_FAILED;
  if (Date.parse(row.expires_at) <= Date.now()) return LINK_FAILED;

  const linked = await db.from("telegram_links").upsert(
    {
      user_id: row.user_id,
      telegram_user_id: options.telegramUserId,
      telegram_chat_id: options.telegramChatId,
      telegram_username: options.telegramUsername,
    },
    { onConflict: "telegram_user_id" },
  );
  if (linked.error) return LINK_FAILED;

  /* Marked consumed only after the link exists, so a failure here leaves the
     code usable rather than burning it on a link that never happened. */
  await db
    .from("telegram_link_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code)
    .is("consumed_at", null);

  return "<b>Linked.</b> Ask me anything, or send /help.";
}

async function unlink(telegramUserId: number): Promise<string> {
  await serviceClient()
    .from("telegram_links")
    .delete()
    .eq("telegram_user_id", telegramUserId);

  return "Unlinked. This chat no longer has access to your account.";
}

/* --- dispatch ------------------------------------------------------------ */

/** Replies for a chat that has no linked account. Never reaches runAgent. */
export async function handleUnlinked(options: {
  text: string;
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername: string | null;
}): Promise<string[]> {
  const { command, argument } = parseCommand(options.text);

  if (command === "link") {
    return [
      await linkChat({
        code: argument,
        telegramUserId: options.telegramUserId,
        telegramChatId: options.telegramChatId,
        telegramUsername: options.telegramUsername,
      }),
    ];
  }

  /* /start carries the code when the user arrives via the deep link. */
  if (command === "start" && /^[A-Za-z0-9]{6}$/.test(argument)) {
    return [
      await linkChat({
        code: argument,
        telegramUserId: options.telegramUserId,
        telegramChatId: options.telegramChatId,
        telegramUsername: options.telegramUsername,
      }),
    ];
  }

  return [linkInstructions()];
}

/** Everything a linked chat can ask for. */
export async function handleCommand(input: CommandInput): Promise<string[]> {
  const { command, argument } = parseCommand(input.text);

  switch (command) {
    case "help":
      return [HELP];

    case "start":
      return [HELP];

    case "unlink":
      return [await unlink(input.telegramUserId)];

    case "link":
      return ["This chat is already linked. Use /unlink to disconnect it."];

    case "positions":
      return positions(input);

    case "watch":
    case "watchlist":
      return watchlist(input);

    default:
      break;
  }

  /* Everything else goes to the model. */
  const question =
    command === "report"
      ? reportPrompt(argument.length > 0 ? normaliseSymbol(argument) : null)
      : command === "ask"
        ? argument
        : input.text.trim();

  if (question.length === 0) {
    return ["Ask me something — or send /help for what I can do."];
  }

  const conversationId = await ensureConversation({
    userId: input.userId,
    surface: "telegram",
    telegramChatId: input.chatId,
  });

  try {
    const { reply } = await runAgent({
      userId: input.userId,
      conversationId,
      message: question,
      surface: "telegram",
      sessionWallet: input.sessionWallet,
    });
    return formatForTelegram(reply);
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return [escapeText(error.message)];
    }
    throw error;
  }
}

/** Runs a command and sends the reply, with the typing indicator held open. */
export async function respond(
  chatId: number,
  produce: () => Promise<string[]>,
): Promise<void> {
  const stopTyping = startTypingHeartbeat(chatId);
  try {
    await sendChunks(chatId, await produce());
  } catch (error) {
    console.error("[telegram] command failed", error);
    await sendChunks(chatId, [
      "Something went wrong handling that. Nothing was changed.",
    ]).catch(() => undefined);
  } finally {
    stopTyping();
  }
}
