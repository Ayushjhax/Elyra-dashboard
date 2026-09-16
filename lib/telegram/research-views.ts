import "server-only";

import { escapeHtml } from "@/lib/personalized/render/telegram";
import { appUrl } from "@/lib/env";
import { marketRecap, type RecapScope } from "@/lib/research/recap";
import { signalsFor } from "@/lib/research/signals";
import { kaminoYield, YIELD_RANKING_NOTE } from "@/lib/research/yield";
import {
  summariseUnlocks,
  unlocksConfigured,
  upcomingUnlocks,
  UNLOCKS_UNAVAILABLE,
} from "@/lib/research/unlocks";
import type { InlineButton } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Research in Telegram.

   Every view reads the same services the web surface does, so a number in a
   chat and the same number on the page cannot disagree. No model call — these
   are computed figures and a language model can only make them worse.
--------------------------------------------------------------------------- */

export interface ResearchView {
  html: string;
  buttons: InlineButton[][];
}

const money = (value: number | null | undefined, digits = 2): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
};

/* --- /recap --------------------------------------------------------------- */

export async function recapView(scope: RecapScope = "crypto"): Promise<ResearchView> {
  const result = await marketRecap(scope);
  const recap = result.data;

  const lines = [`<b>Market recap · ${scope}</b>`, ""];

  for (const section of recap?.sections ?? []) {
    lines.push(`<b>${escapeHtml(section.title)}</b>`);
    if (section.unavailable !== null) {
      /* The reason, not silence. An empty section reads as "nothing
         happened", which is a claim about the market. */
      lines.push(`<i>${escapeHtml(section.unavailable)}</i>`);
    } else {
      for (const line of section.lines) lines.push(escapeHtml(line));
    }
    lines.push("");
  }

  return {
    html: lines.join("\n").trimEnd(),
    buttons: [
      [
        { text: "Crypto", callbackData: "rs:recap:crypto" },
        { text: "Equities", callbackData: "rs:recap:equities" },
      ],
      [{ text: "Open Elyra", url: `${appUrl()}/research` }],
    ],
  };
}

/* --- /signals ------------------------------------------------------------- */

export async function signalsView(symbol: string): Promise<ResearchView> {
  const asset = symbol.trim().toUpperCase();
  if (asset.length === 0) {
    return {
      html: "<b>Signals</b>\n\nWhich asset? Try <code>/signals SOL</code>.",
      buttons: [],
    };
  }

  const result = await signalsFor(asset);
  const signals = result.data ?? [];

  if (signals.length === 0) {
    return {
      html:
        `<b>${escapeHtml(asset)}</b>\n\nNothing notable right now.\n\n` +
        "<i>No move, funding level or venue divergence crossed a threshold. " +
        "A quiet market is a real answer.</i>",
      buttons: [[{ text: "Open Elyra", url: `${appUrl()}/research` }]],
    };
  }

  const lines = [`<b>${escapeHtml(asset)} signals</b>`, ""];

  for (const signal of signals) {
    const arrow =
      signal.direction === "positive" ? "▲" : signal.direction === "negative" ? "▼" : "·";
    lines.push(`${arrow} <b>${escapeHtml(signal.title)}</b>`);
    lines.push(
      `  ${signal.strength} strength · ${signal.confirmationCount} venue${signal.confirmationCount === 1 ? "" : "s"}`,
    );

    for (const item of signal.evidence.slice(0, 4)) {
      lines.push(`  ${escapeHtml(item.label)}: ${escapeHtml(item.value)}`);
    }
    /* Contradictions are shown, never suppressed — a signal that looks
       stronger than it is, is worse than no signal. */
    for (const contradiction of signal.contradictions) {
      lines.push(`  ! ${escapeHtml(contradiction)}`);
    }
    lines.push("");
  }

  lines.push("<i>Observations, not recommendations.</i>");

  return {
    html: lines.join("\n"),
    buttons: [[{ text: "Open Elyra", url: `${appUrl()}/research` }]],
  };
}

/* --- /yield --------------------------------------------------------------- */

export async function yieldView(asset: string | null): Promise<ResearchView> {
  const result = await kaminoYield({ asset, limit: 6 });

  if (!result.ok || result.data === undefined) {
    return {
      html: `<b>Yield</b>\n\n${escapeHtml(result.error?.message ?? "Unavailable.")}`,
      buttons: [],
    };
  }

  if (result.data.length === 0) {
    return {
      html: `<b>Kamino yield</b>\n\nNothing matched${asset === null ? "" : ` for ${escapeHtml(asset)}`}.`,
      buttons: [[{ text: "All assets", callbackData: "rs:yield:all" }]],
    };
  }

  const lines = [
    `<b>Kamino yield${asset === null ? "" : ` · ${escapeHtml(asset.toUpperCase())}`}</b>`,
    "",
  ];

  result.data.forEach((row, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(row.name)}</b>`);
    lines.push(
      `   ${escapeHtml(row.asset)} · <b>${row.apyPct?.toFixed(2) ?? "—"}%</b> APY · ${money(row.tvlUsd, 0)} TVL`,
    );
    if (row.flags.length > 0) lines.push(`   <i>${escapeHtml(row.flags[0])}</i>`);
  });

  lines.push("", `<i>${escapeHtml(YIELD_RANKING_NOTE)}</i>`);

  return {
    html: lines.join("\n"),
    buttons: [
      [
        { text: "Stables", callbackData: "rs:yield:stables" },
        { text: "SOL", callbackData: "rs:yield:SOL" },
      ],
      [{ text: "Open Elyra", url: `${appUrl()}/research` }],
    ],
  };
}

/* --- /unlocks ------------------------------------------------------------- */

export async function unlocksView(
  windowHours: number,
  token: string | null,
): Promise<ResearchView> {
  if (!unlocksConfigured()) {
    /* Named, with the exact fix. Not an empty list — "no unlocks are coming"
       is a claim about the future that nothing here checked. */
    return {
      html: `<b>Token unlocks</b>\n\n${escapeHtml(UNLOCKS_UNAVAILABLE)}`,
      buttons: [[{ text: "Open Elyra", url: `${appUrl()}/research` }]],
    };
  }

  const result = await upcomingUnlocks(windowHours, token);
  if (!result.ok || result.data === undefined) {
    return {
      html: `<b>Token unlocks</b>\n\n${escapeHtml(result.error?.message ?? "Unavailable.")}`,
      buttons: [],
    };
  }

  const summary = summariseUnlocks(result.data);
  const label = windowHours <= 24 ? "24H" : windowHours <= 168 ? "7D" : "30D";

  const lines = [`<b>Upcoming token unlocks · ${label}</b>`, ""];

  if (result.data.length === 0) {
    lines.push("Nothing scheduled in this window.");
  } else {
    result.data.slice(0, 8).forEach((unlock, index) => {
      lines.push(`${index + 1}. <b>${escapeHtml(unlock.token)}</b>`);
      lines.push(`   Date  ${unlock.unlockAt.slice(0, 10)}${unlock.estimated ? " (estimated)" : ""}`);
      lines.push(`   Value ${money(unlock.valueUsd, 0)}`);
      lines.push(
        `   Float ${unlock.percentOfCirculating === null ? "—" : `${unlock.percentOfCirculating.toFixed(2)}%`} · ${unlock.eventType}`,
      );
    });
    lines.push("", `<i>${summary.major.length} event(s) above 1% of circulating supply.</i>`);
  }

  return {
    html: lines.join("\n"),
    buttons: [
      [
        { text: "24H", callbackData: "rs:unlocks:24" },
        { text: "7D", callbackData: "rs:unlocks:168" },
        { text: "30D", callbackData: "rs:unlocks:720" },
      ],
    ],
  };
}

/* --- callbacks ------------------------------------------------------------ */

export function isResearchCallback(data: string): boolean {
  return data.startsWith("rs:");
}

export async function handleResearchCallback(data: string): Promise<ResearchView> {
  const recap = /^rs:recap:(crypto|equities|portfolio)$/.exec(data);
  if (recap !== null) return recapView(recap[1] as RecapScope);

  const yieldMatch = /^rs:yield:(\w+)$/.exec(data);
  if (yieldMatch !== null) {
    const which = yieldMatch[1];
    if (which === "all") return yieldView(null);
    if (which === "stables") {
      const result = await kaminoYield({ stablesOnly: true, limit: 6 });
      const lines = ["<b>Kamino yield · stablecoins</b>", ""];
      for (const row of result.data ?? []) {
        lines.push(
          `<b>${escapeHtml(row.asset)}</b> ${row.apyPct?.toFixed(2) ?? "—"}% · ${money(row.tvlUsd, 0)} · ${escapeHtml(row.name.slice(0, 30))}`,
        );
      }
      return { html: lines.join("\n"), buttons: [[{ text: "All", callbackData: "rs:yield:all" }]] };
    }
    return yieldView(which);
  }

  const unlocks = /^rs:unlocks:(\d+)$/.exec(data);
  if (unlocks !== null) return unlocksView(Number.parseInt(unlocks[1], 10), null);

  return recapView("crypto");
}
