import "server-only";

import { escapeHtml } from "@/lib/personalized/render/telegram";
import { binanceTicker } from "@/lib/providers/binance-public";
import { serviceClient } from "@/lib/supabase/server";
import {
  clearAlerts,
  createAlert,
  listAlerts,
  parseAlertCommand,
} from "@/lib/alerts/store";
import { catalogue, parseSwapCommand, previewSwap } from "@/lib/trade";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   The commands that change something, plus the quick lookups.

   Everything here writes to the caller's own rows or fetches a live quote.
   `userId` is always resolved by the webhook from `from.id`; nothing below
   takes an identifier from message text.
--------------------------------------------------------------------------- */

const money = (value: number, digits = 4): string =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });

/* --- /price --------------------------------------------------------------- */

export async function priceView(symbol: string): Promise<string> {
  if (symbol.length === 0) {
    return "Which symbol? Try <code>/price SOL</code>.";
  }

  const ticker = await binanceTicker(symbol);
  if (!ticker.ok || ticker.data === undefined) {
    return `<b>${escapeHtml(symbol)}</b>\n\n${escapeHtml(
      ticker.error?.message ?? "No price available.",
    )}`;
  }

  const data = ticker.data;
  const arrow = (data.change24hPct ?? 0) >= 0 ? "▲" : "▼";

  return [
    `<b>${escapeHtml(data.symbol)}</b>`,
    "",
    `<b>${money(data.lastPrice)}</b>`,
    data.change24hPct === null
      ? ""
      : `${arrow} ${Math.abs(data.change24hPct).toFixed(2)}% over 24h`,
    data.high24h === null || data.low24h === null
      ? ""
      : `Range ${money(data.low24h)} – ${money(data.high24h)}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/* --- /watch --------------------------------------------------------------- */

export async function watchView(input: {
  userId: string;
  argument: string;
}): Promise<string> {
  const parts = input.argument.trim().split(/\s+/).filter((part) => part.length > 0);
  const verb = (parts[0] ?? "").toLowerCase();

  if (verb === "add" || verb === "remove" || verb === "rm" || verb === "del") {
    const symbol = (parts[1] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (symbol.length === 0) {
      return `Which symbol? Try <code>/watch ${verb} SOL</code>.`;
    }

    if (verb === "add") {
      const { error } = await serviceClient()
        .from("watchlist")
        .upsert(
          { user_id: input.userId, symbol },
          { onConflict: "user_id,symbol", ignoreDuplicates: true },
        );

      if (error) return "Could not add that. Nothing was changed.";
      return `Watching <b>${escapeHtml(symbol)}</b>.`;
    }

    const { data } = await serviceClient()
      .from("watchlist")
      .delete()
      .eq("user_id", input.userId)
      .eq("symbol", symbol)
      .select("symbol");

    return (data ?? []).length > 0
      ? `Removed <b>${escapeHtml(symbol)}</b>.`
      : `${escapeHtml(symbol)} was not on your watchlist.`;
  }

  const { data } = await serviceClient()
    .from("watchlist")
    .select("symbol")
    .eq("user_id", input.userId)
    .order("added_at", { ascending: true })
    .limit(30);

  const symbols = (data ?? []).map((row) => row.symbol);

  if (symbols.length === 0) {
    return [
      "<b>Watchlist</b>",
      "",
      "Empty. Add one with <code>/watch add SOL</code>.",
    ].join("\n");
  }

  /* Priced, because a bare list of tickers is something the user could have
     written down themselves. */
  const lines = ["<b>Watchlist</b>", ""];
  for (const symbol of symbols.slice(0, 15)) {
    const ticker = await binanceTicker(symbol);
    if (!ticker.ok || ticker.data === undefined) {
      lines.push(`<b>${escapeHtml(symbol)}</b> — no price`);
      continue;
    }
    const change = ticker.data.change24hPct;
    const arrow = (change ?? 0) >= 0 ? "▲" : "▼";
    lines.push(
      `<b>${escapeHtml(symbol)}</b> ${money(ticker.data.lastPrice)}` +
        (change === null ? "" : ` · ${arrow} ${Math.abs(change).toFixed(1)}%`),
    );
  }

  if (symbols.length > 15) {
    lines.push("", `<i>…and ${symbols.length - 15} more.</i>`);
  }

  return lines.join("\n");
}

/* --- /alert --------------------------------------------------------------- */

const ALERT_HELP = [
  "<b>Price alerts</b>",
  "",
  "<code>/alert SOL &gt; 120</code> — tell me when SOL goes above $120",
  "<code>/alert SOL &lt; 80</code> — or below $80",
  "<code>/alert list</code> — what is armed",
  "<code>/alert clear SOL</code> — remove alerts on a symbol",
  "<code>/alert clear</code> — remove all of them",
  "",
  "Each alert fires once, then goes quiet. Send it again to re-arm it.",
  "",
  "<i>Turn price alerts on in Elyra first, or nothing will be delivered.</i>",
].join("\n");

export async function alertView(input: {
  userId: string;
  argument: string;
}): Promise<string> {
  const argument = input.argument.trim();
  const lower = argument.toLowerCase();

  if (argument.length === 0 || lower === "help") return ALERT_HELP;

  if (lower === "list") {
    const alerts = await listAlerts(input.userId);
    if (alerts.length === 0) {
      return "<b>Price alerts</b>\n\nNone set. <code>/alert SOL &gt; 120</code>";
    }

    const lines = ["<b>Price alerts</b>", ""];
    for (const alert of alerts) {
      const state = alert.triggeredAt === null ? "armed" : "fired";
      lines.push(
        `<b>${escapeHtml(alert.symbol)}</b> ${alert.direction} ${money(alert.target)} — <i>${state}</i>`,
      );
    }
    return lines.join("\n");
  }

  if (lower === "clear" || lower.startsWith("clear ")) {
    const symbol = argument.slice(5).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const removed = await clearAlerts(input.userId, symbol.length > 0 ? symbol : null);
    return removed === 0
      ? "Nothing to remove."
      : `Removed ${removed} alert${removed === 1 ? "" : "s"}.`;
  }

  /* A current price is needed BEFORE parsing, because "alert me at 120" with
     no direction is only meaningful relative to where the price is now. */
  const probe = /^([A-Za-z][A-Za-z0-9]{0,11})/.exec(argument);
  const ticker = probe === null ? null : await binanceTicker(probe[1]);
  const currentPrice = ticker?.ok === true ? (ticker.data?.lastPrice ?? null) : null;

  const parsed = parseAlertCommand(argument, currentPrice);
  if (parsed === null) {
    return currentPrice === null && probe !== null
      ? `I could not price ${escapeHtml(probe[1].toUpperCase())}, so I cannot tell which side of it you mean. Say <code>&gt;</code> or <code>&lt;</code> explicitly.`
      : ALERT_HELP;
  }

  const created = await createAlert({
    userId: input.userId,
    symbol: parsed.symbol,
    direction: parsed.direction,
    target: parsed.target,
    currentPrice,
  });

  if (!created) return "Could not set that alert. Nothing was changed.";

  return [
    `<b>Alert set.</b>`,
    "",
    `I will message you when ${escapeHtml(parsed.symbol)} goes ${parsed.direction} ${money(parsed.target)}.`,
    currentPrice === null ? "" : `It is ${money(currentPrice)} now.`,
    "",
    "<i>Price alerts must be on in Elyra for this to be delivered.</i>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/* --- /swap ---------------------------------------------------------------- */

const SWAP_HELP = [
  "<b>Swap preview</b>",
  "",
  "<code>/swap 1.5 SOL to USDC</code>",
  "<code>/swap 500 USDC to GLDX</code>",
  "<code>/swap 200 USDC to NVDAX</code>",
  "",
  ...catalogue().map(
    (group) => `<b>${group.label}</b>: ${group.symbols.join(", ")}`,
  ),
  "",
  "I fetch a live Jupiter route — the real output, the real price impact.",
  "Signing happens in Elyra, in your browser, where your wallet is.",
].join("\n");

export interface SwapResult {
  html: string;
  action: PreparedAction | null;
}

export async function swapView(input: {
  argument: string;
  solanaAddress: string | null;
}): Promise<SwapResult> {
  const request = parseSwapCommand(input.argument);
  if (request === null) return { html: SWAP_HELP, action: null };

  const preview = await previewSwap({
    request,
    solanaAddress: input.solanaAddress,
  });

  if ("error" in preview) {
    return {
      html: `<b>Cannot quote that.</b>\n\n${escapeHtml(preview.error)}`,
      action: null,
    };
  }

  const { action } = preview;
  const lines = [`<b>${escapeHtml(action.summary)}</b>`, ""];

  for (const field of action.fields) {
    lines.push(`${escapeHtml(field.label)}: <b>${escapeHtml(field.value)}</b>`);
  }

  for (const warning of action.warnings) {
    lines.push("", `! ${escapeHtml(warning)}`);
  }

  /* A reason only exists when something is wrong, and an empty line where it
     used to be would read as a missing sentence. A preview that looks
     executable and is not is worse than no preview: the user waits for
     something that cannot happen. */
  if (action.reason !== null) lines.push("", escapeHtml(action.reason));

  lines.push("", `<i>${escapeHtml(preview.note)}</i>`);

  return { html: lines.join("\n"), action };
}
