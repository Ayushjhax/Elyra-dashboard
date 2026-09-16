import "server-only";

import { executeTool, type ToolContext } from "@/lib/agent/tools/registry";
import { escapeHtml } from "@/lib/personalized/render/telegram";
import { appUrl } from "@/lib/env";
import type { InlineButton } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Prediction markets in Telegram.

   Reads through the SAME semantic tools the web agent calls. `/predictions`
   and "how are my prediction positions doing?" must never disagree, and the
   only way to guarantee that is one implementation underneath both.

   No model call: these are tables whose numbers are already computed.

   ── The state this surface exists to get right ─────────────────────────

   NOT CONNECTED is not ZERO. Polymarket holds positions in a proxy wallet
   whose address is not the user's EOA, so without a linked address there is
   nothing to read. A card showing "$0.00" to someone who simply has not
   linked theirs is a false statement about their money — and the one a user
   is least likely to question, because zero looks like an answer.
--------------------------------------------------------------------------- */

const money = (value: unknown, digits = 2): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
};

const probability = (value: unknown): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";

function whenLabel(iso: string | null | undefined): string {
  if (typeof iso !== "string") return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";

  const days = Math.round((at - Date.now()) / 86_400_000);
  if (days < 0) return "ended";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return new Date(at).toISOString().slice(0, 10);
}

/** Callback payloads this surface owns. Opaque to the user, routed by prefix. */
export const PREDICTION_CALLBACKS = {
  home: "pm:home",
  positions: "pm:positions",
  discover: "pm:discover",
  trending: "pm:trending",
  orders: "pm:orders",
} as const;

export function isPredictionCallback(data: string): boolean {
  return data.startsWith("pm:");
}

export interface PredictionView {
  html: string;
  buttons: InlineButton[][];
}

/* ---------------------------------------------------------------------------
   The not-connected card
--------------------------------------------------------------------------- */

function notConnected(reason?: string): PredictionView {
  return {
    html: [
      "<b>Prediction Markets</b>",
      "",
      "Market data is available — you can browse and track any market.",
      "",
      /* The reason is stated, not implied. "Not connected" and "you have no
         positions" are different facts and only one of them is known. */
      escapeHtml(
        reason ??
          "Your own prediction account is not linked yet, so I cannot see your positions.",
      ),
    ].join("\n"),
    buttons: [
      [{ text: "Explore markets", callbackData: PREDICTION_CALLBACKS.trending }],
      /* Linking happens on the web, where the session can be verified and the
         address can be checked against live data before it is saved. A chat
         cannot confirm either. */
      [{ text: "Connect account", url: `${appUrl()}/portfolio` }],
    ],
  };
}

/* ---------------------------------------------------------------------------
   Home
--------------------------------------------------------------------------- */

export async function predictionHome(context: ToolContext): Promise<PredictionView> {
  const outcome = await executeTool("prediction_get_portfolio_summary", {}, context);
  const result = outcome.result as Record<string, unknown>;

  /* The tool's `error` here is written FOR THE MODEL — it explains what not
     to conclude. The card writes its own copy for a person instead. */
  if (result.connected === false) return notConnected();

  if (typeof result.error === "string") {
    return {
      html: [
        "<b>Prediction Markets</b>",
        "",
        "<b>Your positions could not be read.</b>",
        escapeHtml(result.error),
        "",
        "<i>This is a provider problem, not an empty account.</i>",
      ].join("\n"),
      buttons: [[{ text: "Explore markets", callbackData: PREDICTION_CALLBACKS.trending }]],
    };
  }

  const claimable = (result.claimable ?? {}) as { count?: number; valueUsd?: number };
  const largest = result.largestPosition as Record<string, unknown> | null;
  const next = result.nextResolution as Record<string, unknown> | null;

  const lines = [
    "<b>Prediction Markets</b>",
    "",
    `Value       <b>${money(result.currentValueUsd)}</b>`,
    `At risk     ${money(result.capitalAtRiskUsd)}`,
    `Max payout  ${money(result.maxPayoutUsd)}`,
    `Open PnL    ${money(result.unrealisedPnlUsd)}`,
    "",
    `Active markets   ${result.activeMarkets ?? "—"}`,
    `Resolving 7d     ${result.resolvingWithin7d ?? "—"}`,
  ];

  /* Only shown when there IS something to claim — a permanent "Claimable: $0"
     row is noise that trains people to stop reading the card. */
  if ((claimable.count ?? 0) > 0) {
    lines.push("", `<b>Unclaimed winnings ${money(claimable.valueUsd)}</b> · ${claimable.count} market(s)`);
  }

  if (largest !== null) {
    lines.push(
      "",
      "<b>Largest position</b>",
      escapeHtml(String(largest.market)),
      `${escapeHtml(String(largest.outcome))} · ${money(largest.currentValueUsd)} · ${probability(largest.currentProbabilityPct)}`,
    );
  }

  if (next !== null) {
    lines.push(
      "",
      `<b>Next resolution</b> ${whenLabel(next.endsAt as string)}`,
      escapeHtml(String(next.market)),
    );
  }

  lines.push("", "<i>Probabilities are market prices, not Elyra forecasts.</i>");

  return {
    html: lines.join("\n"),
    buttons: [
      [
        { text: "Positions", callbackData: PREDICTION_CALLBACKS.positions },
        { text: "Discover", callbackData: PREDICTION_CALLBACKS.discover },
      ],
      [
        { text: "Trending", callbackData: PREDICTION_CALLBACKS.trending },
        { text: "Open orders", callbackData: PREDICTION_CALLBACKS.orders },
      ],
      [{ text: "Open Elyra", url: `${appUrl()}/portfolio` }],
    ],
  };
}

/* ---------------------------------------------------------------------------
   Positions
--------------------------------------------------------------------------- */

export async function predictionPositions(context: ToolContext): Promise<PredictionView> {
  const outcome = await executeTool("prediction_get_positions", {}, context);
  const result = outcome.result as Record<string, unknown>;

  if (result.connected === false) return notConnected();
  if (typeof result.error === "string") {
    return {
      html: `<b>Prediction positions</b>\n\n${escapeHtml(result.error)}`,
      buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }]],
    };
  }

  const positions = (result.positions ?? []) as Array<Record<string, unknown>>;

  if (positions.length === 0) {
    return {
      html: [
        "<b>Prediction positions</b>",
        "",
        "No open positions.",
        "",
        "<i>Your account is linked, so this is a real zero.</i>",
      ].join("\n"),
      buttons: [
        [{ text: "Discover markets", callbackData: PREDICTION_CALLBACKS.discover }],
        [{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }],
      ],
    };
  }

  const lines = ["<b>Prediction positions</b>", ""];

  for (const position of positions.slice(0, 10)) {
    const pnl = position.pnlUsd;
    const pnlText =
      typeof pnl === "number" ? `${pnl >= 0 ? "+" : ""}${money(pnl)}` : "—";

    lines.push(`<b>${escapeHtml(String(position.market))}</b>`);
    lines.push(
      `  ${escapeHtml(String(position.outcome))} · ${money(position.currentValueUsd)} · ${pnlText}`,
    );
    lines.push(
      `  ${probability(position.entryProbabilityPct)} → ${probability(position.currentProbabilityPct)} · ${whenLabel(position.endsAt as string)}`,
    );
    /* Bounded and exact, which is what makes prediction positions different
       from everything else in the portfolio. */
    lines.push(
      `  Risk ${money(position.maxLossUsd)} · pays ${money(position.maxPayoutUsd)}`,
    );
    if (position.status === "claimable") lines.push("  <b>Won — unclaimed</b>");
    lines.push("");
  }

  if (positions.length > 10) {
    lines.push(`<i>…and ${positions.length - 10} more. Open Elyra for the full list.</i>`);
  }

  return {
    html: lines.join("\n").trimEnd(),
    buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }]],
  };
}

/* ---------------------------------------------------------------------------
   Discovery
--------------------------------------------------------------------------- */

/**
 * Categories offered in the UI.
 *
 * Every slug here was checked against the provider's own tag endpoint; the
 * tool validates again at call time and reports an unknown one rather than
 * returning an empty list. "Culture" is deliberately absent — it reads like
 * an obvious category and does not exist on the provider.
 */
const CATEGORIES: Array<{ slug: string; label: string }> = [
  { slug: "crypto", label: "Crypto" },
  { slug: "politics", label: "Politics" },
  { slug: "economics", label: "Economics" },
  { slug: "geopolitics", label: "Geopolitics" },
  { slug: "tech", label: "Tech" },
  { slug: "sports", label: "Sports" },
];

export function predictionDiscover(): PredictionView {
  return {
    html: [
      "<b>Discover prediction markets</b>",
      "",
      "Pick a category, or just ask —",
      "<i>“find prediction markets about SOL”</i>",
    ].join("\n"),
    buttons: [
      ...chunk(
        CATEGORIES.map((category) => ({
          text: category.label,
          callbackData: `pm:cat:${category.slug}`,
        })),
        2,
      ),
      [{ text: "Trending", callbackData: PREDICTION_CALLBACKS.trending }],
      [{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }],
    ],
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/** One rendered market card: the question and what the market is pricing. */
function marketCard(market: Record<string, unknown>): string[] {
  const outcomes = (market.outcomes ?? []) as Array<{
    label: string;
    impliedProbabilityPct: number;
  }>;

  const lines = [`<b>${escapeHtml(String(market.question))}</b>`];

  /* Top two outcomes only. A twelve-way market rendered in full is a wall of
     text on a phone, and the two leaders carry the information. */
  for (const outcome of outcomes.slice(0, 2)) {
    lines.push(
      `  ${escapeHtml(outcome.label)}  <b>${outcome.impliedProbabilityPct}%</b>`,
    );
  }

  const meta: string[] = [];
  if (typeof market.volume24hUsd === "number") meta.push(`Vol ${money(market.volume24hUsd, 0)}`);
  if (typeof market.liquidityUsd === "number") meta.push(`Liq ${money(market.liquidityUsd, 0)}`);
  if (typeof market.endsAt === "string") meta.push(`Ends ${whenLabel(market.endsAt)}`);
  if (meta.length > 0) lines.push(`  <i>${escapeHtml(meta.join(" · "))}</i>`);

  return lines;
}

export async function predictionTrending(context: ToolContext): Promise<PredictionView> {
  const outcome = await executeTool("prediction_get_trending", { limit: 6 }, context);
  const result = outcome.result as Record<string, unknown>;

  if (typeof result.error === "string") {
    return {
      html: `<b>Trending prediction markets</b>\n\n${escapeHtml(result.error)}`,
      buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }]],
    };
  }

  const markets = (result.markets ?? []) as Array<Record<string, unknown>>;
  const lines = ["<b>Trending prediction markets</b>", ""];

  for (const market of markets) {
    lines.push(...marketCard(market), "");
  }

  lines.push("<i>Market-implied probabilities, not Elyra forecasts.</i>");

  return {
    html: lines.join("\n"),
    buttons: [
      [{ text: "Categories", callbackData: PREDICTION_CALLBACKS.discover }],
      [{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }],
    ],
  };
}

export async function predictionCategory(
  context: ToolContext,
  slug: string,
): Promise<PredictionView> {
  const outcome = await executeTool(
    "prediction_search_events",
    { category: slug, limit: 5 },
    context,
  );
  const result = outcome.result as Record<string, unknown>;

  const label = CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

  if (typeof result.error === "string") {
    return {
      html: `<b>${escapeHtml(label)}</b>\n\n${escapeHtml(result.error)}`,
      buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.discover }]],
    };
  }

  const events = (result.events ?? []) as Array<Record<string, unknown>>;
  const lines = [`<b>${escapeHtml(label)} prediction markets</b>`, ""];

  if (events.length === 0) {
    lines.push("Nothing active in this category right now.");
  }

  for (const event of events) {
    lines.push(`<b>${escapeHtml(String(event.title))}</b>`);
    const markets = (event.markets ?? []) as Array<Record<string, unknown>>;
    for (const market of markets.slice(0, 3)) {
      const outcomes = (market.outcomes ?? []) as Array<{
        label: string;
        impliedProbabilityPct: number;
      }>;
      const top = outcomes[0];
      if (top === undefined) continue;
      lines.push(
        `  ${escapeHtml(String(market.question)).slice(0, 60)} — <b>${top.impliedProbabilityPct}%</b> ${escapeHtml(top.label)}`,
      );
    }
    lines.push("");
  }

  return {
    html: lines.join("\n").trimEnd(),
    buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.discover }]],
  };
}

export async function predictionOrders(context: ToolContext): Promise<PredictionView> {
  const outcome = await executeTool("prediction_get_open_orders", {}, context);
  const result = outcome.result as Record<string, unknown>;

  return {
    html: [
      "<b>Open prediction orders</b>",
      "",
      escapeHtml(
        typeof result.error === "string"
          ? result.error
          : "Open orders cannot be read yet.",
      ),
    ].join("\n"),
    buttons: [[{ text: "Back", callbackData: PREDICTION_CALLBACKS.home }]],
  };
}

/* ---------------------------------------------------------------------------
   Callback routing
--------------------------------------------------------------------------- */

/** Handles a `pm:` button tap. Every branch is read-only. */
export async function handlePredictionCallback(
  context: ToolContext,
  data: string,
): Promise<PredictionView> {
  if (data === PREDICTION_CALLBACKS.positions) return predictionPositions(context);
  if (data === PREDICTION_CALLBACKS.discover) return predictionDiscover();
  if (data === PREDICTION_CALLBACKS.trending) return predictionTrending(context);
  if (data === PREDICTION_CALLBACKS.orders) return predictionOrders(context);

  const category = /^pm:cat:([a-z0-9-]{1,40})$/.exec(data);
  if (category !== null) return predictionCategory(context, category[1]);

  return predictionHome(context);
}
