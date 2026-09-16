/* ---------------------------------------------------------------------------
   A PersonalizedAnswer, rendered for Telegram.

   The agent produces ONE channel-independent structure. The dashboard draws
   it as cards; this draws it as HTML. Neither re-asks a model — §40 is
   explicit that a second LLM call merely to shorten formatting is waste, and
   it would also be a second chance to change the numbers.

   Telegram's HTML parse mode supports a deliberately small tag set: b, i, u,
   s, a, code, pre, blockquote. No lists, no tables, no headings. So structure
   is carried by line breaks and a leading glyph rather than by markup that
   would be rejected.

   Pure, and tested directly — no `server-only`.
--------------------------------------------------------------------------- */

import type { PersonalizedAnswer, PreparedAction } from "@/lib/personalized/types";

/** Telegram rejects a message over 4096 characters outright. */
const MAX_MESSAGE = 3_800;

/**
 * Escapes the three characters Telegram's HTML parser treats as markup.
 *
 * Applied to every piece of model output and every provider string. A token
 * named `<b>` is a real thing that exists, and unescaped it would either
 * break the parse — Telegram rejects the whole message, so the user sees
 * nothing — or inject formatting into a financial figure.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TONE_GLYPH: Record<string, string> = {
  positive: "▲",
  negative: "▼",
  risk: "!",
  neutral: "·",
};

function renderMetrics(answer: PersonalizedAnswer): string[] {
  if (answer.metrics === undefined || answer.metrics.length === 0) return [];

  /* Label and value on one line each rather than a column layout: Telegram
     has no monospace table that survives a phone's width, and a wrapped
     pseudo-table is less readable than plain lines. */
  const lines = answer.metrics.map((metric) => {
    const delta = metric.delta === undefined ? "" : ` (${escapeHtml(metric.delta)})`;
    return `${escapeHtml(metric.label)}: <b>${escapeHtml(metric.value)}</b>${delta}`;
  });

  return ["", ...lines];
}

function renderInsights(answer: PersonalizedAnswer): string[] {
  if (answer.insights === undefined || answer.insights.length === 0) return [];

  const lines: string[] = [""];
  for (const insight of answer.insights) {
    const glyph = TONE_GLYPH[insight.type] ?? "·";
    lines.push(`${glyph} <b>${escapeHtml(insight.title)}</b>`);
    lines.push(escapeHtml(insight.detail));
  }
  return lines;
}

function renderAction(action: PreparedAction): string[] {
  const lines = ["", `<b>Prepared: ${escapeHtml(action.summary)}</b>`];

  for (const field of action.fields) {
    lines.push(`${escapeHtml(field.label)}: ${escapeHtml(field.value)}`);
  }

  for (const warning of action.warnings) lines.push(`! ${escapeHtml(warning)}`);

  /* The readiness line is not optional. A preview that looks executable and
     is not is worse than no preview: the operator waits for something that
     will never happen. */
  if (action.readiness !== "ready" && action.reason !== null) {
    lines.push("", escapeHtml(action.reason));
  } else if (action.readiness === "ready") {
    lines.push("", "Confirm in Elyra to execute — nothing has been sent.");
  }

  return lines;
}

/**
 * The message, and the prompts worth offering as buttons.
 *
 * Returns text separately from suggestions so the caller can decide whether
 * this chat supports inline keyboards.
 */
export function renderAnswerForTelegram(answer: PersonalizedAnswer): {
  text: string;
  suggestions: string[];
} {
  const lines: string[] = [];

  if (answer.headline !== undefined) {
    lines.push(`<b>${escapeHtml(answer.headline)}</b>`, "");
  }

  lines.push(escapeHtml(answer.message));
  lines.push(...renderMetrics(answer));
  lines.push(...renderInsights(answer));

  if (answer.preparedAction !== undefined) {
    lines.push(...renderAction(answer.preparedAction));
  }

  /* Partial data is surfaced here rather than left to the dashboard: someone
     reading in Telegram has no rail telling them a venue was unreadable. */
  if (answer.contextUsed !== undefined && answer.contextUsed.length > 0) {
    lines.push("", `<i>Context: ${escapeHtml(answer.contextUsed.join(" · "))}</i>`);
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_MESSAGE) {
    text = `${text.slice(0, MAX_MESSAGE)}\n\n<i>Truncated — open Elyra for the full answer.</i>`;
  }

  return { text, suggestions: answer.suggestedPrompts?.slice(0, 3) ?? [] };
}

/**
 * What a group chat is allowed to see.
 *
 * §41 and §70 make this mandatory: private financial data never leaves a
 * private chat. The refusal names no figure and confirms nothing about
 * whether the asker even has an account.
 */
export function groupChatRefusal(): string {
  return [
    "<b>Not here.</b>",
    "",
    "Portfolio, balances and positions are only available in a private chat.",
    "Message me directly and ask again.",
  ].join("\n");
}
