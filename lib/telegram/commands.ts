import "server-only";

import { ensureConversation, runAgent, UsageLimitError } from "@/lib/agent";
import { formatForTelegram } from "@/lib/agent/format/telegram";
import { reportPrompt } from "@/lib/agent/prompt";
import { normaliseSymbol } from "@/lib/agent/tools/args";
import type { ToolContext } from "@/lib/agent/tools/registry";
import { appUrl, optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";
import {
  sendChunks,
  sendMessage,
  sendMessageWithButtons,
  startTypingHeartbeat,
  type InlineButton,
} from "@/lib/telegram/api";
import {
  acknowledgePreparedAction,
  callbackDataFor,
  resolvePreparedAction,
  storePreparedAction,
  tokenFromCallback,
} from "@/lib/telegram/actions";
import { answerFromTelegram } from "@/lib/telegram/personalized";
import {
  alertView,
  priceView,
  swapView,
  watchView,
} from "@/lib/telegram/actions-views";
import { notificationPreferences } from "@/lib/telegram/notifications";
import {
  handlePredictionCallback,
  isPredictionCallback,
  predictionHome,
} from "@/lib/telegram/prediction";
import {
  activityView,
  defiView,
  marketsView,
  ordersView,
  portfolioView,
  positionsView,
  walletView,
} from "@/lib/telegram/views";

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
  "<b>/portfolio</b> — total capital across every venue",
  "<b>/wallet</b> — your token holdings",
  "<b>/positions</b> — exposure and concentration",
  "<b>/defi</b> — lending, leverage and vault positions",
  "<b>/markets</b> [symbol] — funding and mark price, or what markets are pricing",
  "<b>/price</b> &lt;symbol&gt; — a quick price",
  "<b>/swap</b> 1.5 SOL to USDC — a live quote, preview only",
  "<b>/alert</b> SOL &gt; 120 — tell me when it crosses",
  "<b>/alerts</b> — what Elyra sends you",
  "<b>/watch</b> [add|remove] &lt;symbol&gt; — your watchlist, priced",
  "<b>/predictions</b> — prediction markets and your exposure",
  "<b>/orders</b> — resting orders on Hyperliquid",
  "<b>/activity</b> — recent fills, with realised PnL",
  "<b>/ask</b> &lt;question&gt; — same as just typing",
  "<b>/report</b> [symbol] — a short written report",
  "<b>/settings</b> — open Elyra",
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

/* ------------------------------------------------------------------------- */

/** A reply, with the buttons that belong under it. */
export interface CommandReply {
  chunks: string[];
  buttons?: InlineButton[][];
}

/** What the webhook hands to a command. */
export interface CommandInput {
  userId: string;
  chatId: number;
  /* The Telegram account, which is what telegram_links is keyed on. Distinct
     from chatId: they are equal in a private chat and differ in a group. */
  telegramUserId: number;
  text: string;
  sessionWallet: string | null;
  /** Solana, for the unified Personalized context. */
  solanaAddress?: string | null;
  /** The prediction-market account, resolved by the webhook from the profile. */
  polymarketAddress?: string | null;
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

/**
 * What is currently being sent, and how to change it.
 *
 * Read-only in chat on purpose. Toggling a notification changes what gets
 * broadcast to this chat, and a tap in Telegram authenticates a chat account
 * rather than the Elyra account behind it — so the switch lives where the
 * session does.
 */
async function alertsSummary(input: CommandInput): Promise<string> {
  const preferences = await notificationPreferences(input.userId);

  const state = (on: boolean) => (on ? "on" : "off");

  return [
    "<b>Alerts</b>",
    "",
    `Price alerts: <b>${state(preferences.priceAlerts)}</b>`,
    `Liquidation warnings: <b>${state(preferences.liquidationAlerts)}</b>`,
    `Large moves: <b>${state(preferences.largeMoves)}</b> (over ${preferences.moveThresholdPct}%)`,
    `Daily summary: <b>${state(preferences.dailySummary)}</b>`,
    "",
    `Change these in Elyra: ${escapeText(appUrl())}`,
  ].join("\n");
}

/** The verified identity, in the shape every tool expects. */
function toolContext(input: CommandInput): ToolContext {
  return {
    userId: input.userId,
    sessionWallet: input.sessionWallet,
    solanaAddress: input.solanaAddress ?? null,
    polymarketAddress: input.polymarketAddress ?? null,
  };
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
export async function handleCommand(input: CommandInput): Promise<CommandReply | string[]> {
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
      return formatChunks(await positionsView(toolContext(input)));

    case "portfolio":
      return formatChunks(await portfolioView(toolContext(input)));

    case "wallet":
      return formatChunks(await walletView(toolContext(input)));

    case "defi":
      return formatChunks(await defiView(toolContext(input)));

    case "markets":
    case "market":
      return formatChunks(
        await marketsView(
          toolContext(input),
          argument.length > 0 ? normaliseSymbol(argument) : null,
        ),
      );

    case "orders":
      return formatChunks(await ordersView(toolContext(input)));

    case "activity":
    case "fills":
      return formatChunks(await activityView(toolContext(input)));

    case "predictions":
    case "prediction": {
      /* Prediction markets are private financial data, so the same §41 gate
         that guards the portfolio applies: chatId equals telegramUserId only
         in a direct message. */
      if (input.chatId !== input.telegramUserId) {
        return ["Prediction positions are only available in a private chat."];
      }
      const view = await predictionHome(toolContext(input));
      return { chunks: formatChunks(view.html), buttons: view.buttons };
    }

    case "alerts":
      return [await alertsSummary(input)];

    case "alert":
      return formatChunks(
        await alertView({ userId: input.userId, argument }),
      );

    case "price":
      return formatChunks(
        await priceView(argument.length > 0 ? normaliseSymbol(argument) : ""),
      );

    case "swap": {
      const result = await swapView({
        argument,
        solanaAddress: input.solanaAddress ?? null,
      });

      /* A quote that cannot execute gets NO confirm button. Offering one for
         something nothing can carry out is a promise the product will not
         keep — the link goes to Elyra instead, where the work continues. */
      return { chunks: formatChunks(result.html) };
    }

    case "settings":
      return [
        `<b>Settings</b>\n\nAlerts, memory and connected venues live in Elyra:\n${escapeText(appUrl())}`,
      ];

    case "watch":
    case "watchlist":
      return formatChunks(
        await watchView({ userId: input.userId, argument }),
      );

    default:
      break;
  }

  /* ---- Everything else goes to the agent ----

     `/report` keeps the old tool-loop agent: it is a market write-up about a
     symbol, needs the tool registry, and is not a question about the
     operator's own capital.

     Everything else — plain language, and `/ask` — goes to the SAME
     Personalized runtime the dashboard uses. That is the unification: one
     context builder, one orchestrator, one memory table, one conversation
     store. A limit saved on the web applies here, and "what changed since
     then?" works across the two because they share a transcript. */

  if (command === "report") {
    const question = reportPrompt(
      argument.length > 0 ? normaliseSymbol(argument) : null,
    );
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
        solanaAddress: input.solanaAddress ?? null,
      });
      return formatForTelegram(reply);
    } catch (error) {
      if (error instanceof UsageLimitError) return [escapeText(error.message)];
      throw error;
    }
  }

  const question = command === "ask" ? argument : input.text.trim();
  if (question.length === 0) {
    return ["Ask me something — or send /help for what I can do."];
  }

  const reply = await answerFromTelegram({
    userId: input.userId,
    chatId: input.chatId,
    message: question,
    solanaAddress: input.solanaAddress ?? null,
    sessionWallet: input.sessionWallet,
    /* Equal in a private chat, different in a group — Telegram's own shape,
       so no extra lookup is needed to enforce §41. */
    isPrivateChat: input.chatId === input.telegramUserId,
  });

  /* A prepared action gets a button carrying an OPAQUE handle. The amounts
     live in the stored row, not in the 64 bytes Telegram hands back — see
     lib/telegram/actions.ts for why that distinction is the whole design.

     Only a `ready` action gets one. Offering a button for something nothing
     can execute is a promise the product cannot keep. */
  if (reply.preparedAction !== undefined && reply.preparedAction.readiness === "ready") {
    const stored = await storePreparedAction({
      userId: input.userId,
      action: reply.preparedAction,
      surface: "telegram",
    });

    /* No button at all when the store is unreachable. A button that cannot
       resolve is worse than none, because the user waits for it. */
    if (stored !== null) {
      return {
        chunks: [reply.html],
        buttons: [[{ text: "Review in Elyra", callbackData: callbackDataFor(stored.token) }]],
      };
    }
  }

  return { chunks: [reply.html] };
}

/**
 * Runs a command and sends the reply, with the typing indicator held open.
 *
 * Buttons ride on the LAST chunk. Attaching them to the first would leave the
 * keyboard scrolled off screen above the text it applies to.
 */
export async function respond(
  chatId: number,
  produce: () => Promise<string[] | CommandReply>,
): Promise<void> {
  const stopTyping = startTypingHeartbeat(chatId);
  try {
    const produced = await produce();
    const reply: CommandReply = Array.isArray(produced)
      ? { chunks: produced }
      : produced;

    const buttons = reply.buttons ?? [];
    if (buttons.length === 0) {
      await sendChunks(chatId, reply.chunks);
      return;
    }

    const last = reply.chunks.length - 1;
    for (let index = 0; index < reply.chunks.length; index += 1) {
      if (index === last) {
        await sendMessageWithButtons(chatId, reply.chunks[index], buttons);
      } else {
        await sendMessage(chatId, reply.chunks[index]);
      }
    }
  } catch (error) {
    console.error("[telegram] command failed", error);
    await sendChunks(chatId, [
      "Something went wrong handling that. Nothing was changed.",
    ]).catch(() => undefined);
  } finally {
    stopTyping();
  }
}

/* ---------------------------------------------------------------------------
   Callback queries — a tapped button
--------------------------------------------------------------------------- */

/**
 * Handles a tap on an inline button.
 *
 * The ONLY thing a tap can do is acknowledge. Telegram authenticates a chat
 * account; it does not establish custody of a wallet, and an inline button is
 * not a consent mechanism for moving money. So this resolves the opaque token
 * against the caller's own rows, records that they asked to proceed, and
 * hands back a link to a surface that can actually verify them.
 *
 * `userId` is resolved by the webhook from `from.id`. It is passed in rather
 * than read from the callback payload, and it scopes the lookup: a token that
 * leaked out of one chat does not resolve in another.
 */
export async function handleCallback(input: {
  userId: string;
  data: string;
  sessionWallet?: string | null;
  solanaAddress?: string | null;
  polymarketAddress?: string | null;
}): Promise<string | CommandReply> {
  /* Prediction navigation is read-only and owns the `pm:` prefix. Routed
     before the prepared-action path so a browse tap never touches the action
     store. */
  if (isPredictionCallback(input.data)) {
    const view = await handlePredictionCallback(
      {
        userId: input.userId,
        sessionWallet: input.sessionWallet ?? null,
        solanaAddress: input.solanaAddress ?? null,
        polymarketAddress: input.polymarketAddress ?? null,
      },
      input.data,
    );
    return { chunks: formatChunks(view.html), buttons: view.buttons };
  }

  const token = tokenFromCallback(input.data);
  if (token === null) {
    return "That button is no longer valid. Ask again for a fresh preview.";
  }

  const record = await resolvePreparedAction(token, input.userId);

  if (record === null) {
    /* Same answer for "no such token" and "someone else's token". Telling the
       two apart would confirm which handles exist. */
    return "That action is no longer available. Ask again for a fresh preview.";
  }

  if (record.status === "expired") {
    return (
      "<b>That preview has expired.</b>\n\nPrices and balances move, so a " +
      "prepared action is only good for a few minutes. Ask again and I will " +
      "re-read your positions."
    );
  }

  if (record.status !== "prepared") {
    /* Idempotent: a double tap, or Telegram redelivering the callback, says
       the same thing rather than acknowledging twice. */
    return `Already noted. Open Elyra to confirm it: ${escapeText(appUrl())}`;
  }

  await acknowledgePreparedAction(token, input.userId);

  return [
    `<b>Noted — ${escapeText(record.action.summary)}</b>`,
    "",
    "Nothing has been sent. Confirming a transaction needs your wallet, which",
    "Telegram cannot authorise — a chat account is not a signature.",
    "",
    `Open Elyra to confirm: ${escapeText(appUrl())}`,
  ].join("\n");
}
