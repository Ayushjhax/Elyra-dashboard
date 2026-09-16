import "server-only";

import { escapeHtml } from "@/lib/personalized/render/telegram";
import type { InlineButton } from "@/lib/telegram/api";
import type { PredictionView } from "@/lib/telegram/prediction";
import { describeWindow } from "@/lib/prediction/book-analytics";
import { buildSignal, liveMarket } from "@/lib/prediction/signals";
import { saveSignal } from "@/lib/prediction/signal-store";
import type { PredictionTechnicalSignal } from "@/lib/prediction/signal-types";
import type { ToolContext } from "@/lib/agent/tools/registry";

/* ---------------------------------------------------------------------------
   Prediction signals, order books and baskets in Telegram.

   ── This file renders. It does not compute. ────────────────────────────

   Every figure below comes from `lib/prediction/*`, the same services the web
   panel and the Agent read. There is no arithmetic here beyond formatting a
   number for display, and that is deliberate: a second implementation of a
   microprice would drift from the first, and the copy living in the chat
   client is the one nobody tests.

   ── Only real fields are rendered ──────────────────────────────────────

   A null figure is omitted or printed as an explicit absence. It is never
   replaced by a dash that reads like a value, and never by a plausible
   default. A card with four rows of real data is worth more than one with
   eight rows where two are invented.
--------------------------------------------------------------------------- */

/**
 * 0–1 as cents, the unit these markets are spoken in.
 *
 * A decimal is shown only when the value is not a whole cent. Rounding to
 * whole cents throughout printed a midpoint of 11.5¢ as "12¢" on a book
 * quoting 11/12 — making the mid look identical to the ask, which is both
 * wrong and exactly the kind of error that reads as a broken feed.
 */
function cents(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const points = value * 100;
  const whole = Math.abs(points - Math.round(points)) < 1e-9;
  return `${points.toFixed(whole ? 0 : 1)}¢`;
}

function pct(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";
}

function usd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function signed(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function ago(ms: number): string {
  if (ms < 1_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

/* ---------------------------------------------------------------------------
   Callbacks

   Telegram caps `callback_data` at 64 BYTES. A Polymarket token id alone is
   77 digits, so it can never travel in a callback. The market's Gamma id is
   short and is what these carry; the token is re-resolved server-side.
--------------------------------------------------------------------------- */

export const SIGNAL_CALLBACKS = {
  signal: "pms:sig:",
  book: "pms:book:",
  basket: "pms:basket:",
  alert: "pms:alert:",
} as const;

export function isSignalCallback(data: string): boolean {
  return data.startsWith("pms:");
}

/** A market id, validated. Gamma ids are numeric, which bounds the payload. */
function marketIdFrom(data: string, prefix: string): string | null {
  const raw = data.slice(prefix.length);
  return /^[0-9]{1,20}$/.test(raw) ? raw : null;
}

function navigation(marketId: string, url: string | null): InlineButton[][] {
  const rows: InlineButton[][] = [
    [
      { text: "Signal", callbackData: `${SIGNAL_CALLBACKS.signal}${marketId}` },
      { text: "Live book", callbackData: `${SIGNAL_CALLBACKS.book}${marketId}` },
    ],
    [
      { text: "Basket", callbackData: `${SIGNAL_CALLBACKS.basket}${marketId}` },
      { text: "Set alert", callbackData: `${SIGNAL_CALLBACKS.alert}${marketId}` },
    ],
  ];
  if (url !== null) rows.push([{ text: "Open market", url }]);
  return rows;
}

function unavailable(title: string, reason: string, marketId?: string): PredictionView {
  return {
    html: [`<b>${escapeHtml(title)}</b>`, "", escapeHtml(reason)].join("\n"),
    buttons:
      marketId === undefined
        ? [[{ text: "Prediction markets", callbackData: "pm:home" }]]
        : navigation(marketId, null),
  };
}

/* ---------------------------------------------------------------------------
   The signal card
--------------------------------------------------------------------------- */

const DIRECTION_LABEL: Record<string, string> = {
  long_yes: "LONG YES",
  long_no: "LONG NO",
  long_outcome: "LONG OUTCOME",
  watch: "WATCH",
  neutral: "NEUTRAL",
};

function entryLine(signal: PredictionTechnicalSignal): string {
  const { entry } = signal;
  if (entry.minPrice !== undefined && entry.maxPrice !== undefined) {
    return `${cents(entry.minPrice)}–${cents(entry.maxPrice)}`;
  }
  if (entry.price !== undefined) return cents(entry.price);
  return entry.trigger ?? "—";
}

export function renderSignalCard(
  signal: PredictionTechnicalSignal,
  marketUrl: string | null,
): PredictionView {
  const lines: string[] = ["<b>Prediction Signal</b>", ""];

  lines.push(escapeHtml(signal.marketQuestion), "");
  lines.push(`<b>Outcome</b>  ${escapeHtml(signal.outcomeLabel)}`);
  lines.push(
    `<b>Direction</b>  ${escapeHtml(DIRECTION_LABEL[signal.direction] ?? signal.direction)}`,
  );

  const actionable =
    signal.direction === "long_yes" ||
    signal.direction === "long_no" ||
    signal.direction === "long_outcome";

  if (actionable) {
    lines.push("", `<b>Entry</b>  ${escapeHtml(entryLine(signal))}`);

    const target = signal.target.price ?? signal.target.maxPrice;
    if (target !== undefined) lines.push(`<b>Target</b>  ${cents(target)}`);

    if (signal.stop.price !== undefined) {
      /* "Invalidation", not "stop", wherever a fill cannot be promised — a
         thin book gaps through a level rather than filling at it. */
      const label = signal.stop.executable ? "Stop" : "Invalidation";
      lines.push(`<b>${label}</b>  ${cents(signal.stop.price)}`);
    }

    if (signal.riskReward !== null) {
      lines.push(`<b>Risk / Reward</b>  ${signal.riskReward.toFixed(2)}`);
    }
  } else if (signal.entry.trigger !== undefined && signal.entry.trigger.length > 0) {
    lines.push("", escapeHtml(signal.entry.trigger));
  }

  /* ---- Win rate. Absent is printed as absent. ---- */
  lines.push("", "<b>Historical Win Rate</b>");
  const rate = signal.historicalWinRate;
  if (rate === null) {
    /* The engine's own sentence, which for an order-book strategy carries the
       forward-collection progress. Hard-coding a replacement here would let
       the chat card and the web panel disagree about why the number is
       missing — and would freeze at "never" a state that is "not yet". */
    lines.push(
      escapeHtml(
        signal.winRateUnavailableReason ??
          "Not available — no comparable historical sample exists for this strategy.",
      ),
    );
  } else if (rate.insufficientSample) {
    /* Never headline an unstable percentage. */
    lines.push(escapeHtml(`Insufficient sample · ${rate.sampleSize} comparable signals`));
  } else {
    lines.push(
      escapeHtml(`${rate.valuePct.toFixed(1)}% · ${rate.sampleSize} comparable signals`),
    );
    lines.push(`<i>${escapeHtml(rate.marketUniverse)}</i>`);
  }

  /* ---- Microstructure ---- */
  const snapshot = signal.snapshot;
  lines.push("", "<b>Order Book</b>");
  if (snapshot.imbalanceTop5 !== null) {
    lines.push(`Imbalance  ${signed(snapshot.imbalanceTop5)} (top 5)`);
  }
  if (snapshot.spreadPoints !== null) {
    lines.push(`Spread  ${snapshot.spreadPoints.toFixed(1)} pts`);
  }
  if (snapshot.microprice !== null) lines.push(`Microprice  ${cents(snapshot.microprice)}`);
  if (snapshot.depthTop5Usd !== null) lines.push(`Depth  ${usd(snapshot.depthTop5Usd)}`);

  if (snapshot.basketProbability !== null) {
    lines.push("", `<b>Basket</b>  ${pct(snapshot.basketProbability)}`);
  }

  lines.push(
    "",
    `<b>Strength</b>  ${escapeHtml(signal.strength)}`,
    `<b>Liquidity</b>  ${escapeHtml(signal.liquidityQuality)}`,
  );

  /* ---- Evidence ---- */
  if (signal.evidence.length > 0) {
    lines.push("", "<b>Evidence</b>");
    for (const item of signal.evidence.slice(0, 5)) {
      const mark = item.direction === "supports" ? "✓" : item.direction === "contradicts" ? "✗" : "·";
      lines.push(`${mark} ${escapeHtml(item.label)}: ${escapeHtml(String(item.value))}`);
    }
  }

  lines.push(
    "",
    `<i>${escapeHtml(signal.strategyId)} · ${escapeHtml(signal.transport === "realtime" ? "live feed" : "REST snapshot")} · ${escapeHtml(ago(signal.dataFreshnessMs))}</i>`,
  );

  if (signal.warnings.length > 0) {
    lines.push("", ...signal.warnings.slice(0, 3).map((warning) => `⚠ ${escapeHtml(warning)}`));
  }

  /* A signal is never an instruction to trade. */
  lines.push("", "<i>Analysis, not advice. A signal does not place an order.</i>");

  return { html: lines.join("\n"), buttons: navigation(signal.marketId, marketUrl) };
}

export async function predictionSignal(
  context: ToolContext,
  query: string,
): Promise<PredictionView> {
  const result = await buildSignal({ query });

  if (!result.ok || result.signal === undefined) {
    const lines = [
      "<b>Prediction Signal</b>",
      "",
      escapeHtml(result.reason ?? "No signal could be produced."),
    ];

    /* Saying WHICH strategies could not run, and why, turns "nothing here"
       into "turn the live feed on and there would be". */
    if (result.skipped !== undefined && result.skipped.length > 0) {
      lines.push("", "<b>Not evaluated</b>");
      for (const entry of result.skipped.slice(0, 4)) {
        lines.push(`· ${escapeHtml(entry.strategyId)} — ${escapeHtml(entry.reason)}`);
      }
    }

    return {
      html: lines.join("\n"),
      buttons:
        result.market === undefined
          ? [[{ text: "Prediction markets", callbackData: "pm:home" }]]
          : navigation(result.market.id, result.market.url ?? null),
    };
  }

  /* Stored so a follow-up "alert me when this triggers" references THIS
     setup by id rather than a description written from the card. */
  if (context.userId.length > 0) {
    await saveSignal({ userId: context.userId, signal: result.signal });
  }

  return renderSignalCard(result.signal, result.market?.url ?? null);
}

/* ---------------------------------------------------------------------------
   The live order book
--------------------------------------------------------------------------- */

export async function predictionOrderbook(query: string): Promise<PredictionView> {
  const view = await liveMarket(query);
  if (view === null) {
    return unavailable("Order Book", `No Polymarket market matched "${query}".`);
  }

  const outcome = [...view.state.outcomes.values()][0];
  if (outcome === undefined) {
    return unavailable(
      "Order Book",
      view.state.warnings[0] ?? "The order book could not be read.",
      view.resolved.market.id,
    );
  }

  const analytics = view.analytics.get(outcome.tokenId);
  const lines = [
    `<b>${escapeHtml(outcome.outcomeLabel ?? "Outcome")} Order Book</b>`,
    "",
    escapeHtml(view.resolved.market.question),
    "",
  ];

  lines.push(`Best Bid     ${cents(analytics?.bestBid)}`);
  lines.push(`Best Ask     ${cents(analytics?.bestAsk)}`);
  lines.push(`Mid          ${cents(analytics?.midpoint)}`);
  lines.push(`Microprice   ${cents(analytics?.microprice)}`);
  lines.push(
    `Spread       ${analytics?.spreadPoints === null || analytics === undefined ? "—" : `${analytics.spreadPoints.toFixed(1)} pts`}`,
  );

  if (analytics !== undefined) {
    lines.push("", "<b>Top-5 Depth</b>");
    lines.push(`Bid   ${usd(analytics.depth.top5.bidUsd)}`);
    lines.push(`Ask   ${usd(analytics.depth.top5.askUsd)}`);

    /* The window travels with the number — two imbalances over different
       windows are different statistics and must not be compared silently. */
    lines.push(
      "",
      `<b>Imbalance</b>  ${signed(analytics.depth.top5.imbalance)}`,
      `<i>${escapeHtml(describeWindow(analytics.depth.top5.window))}</i>`,
    );

    if (analytics.bidWalls.length > 0 || analytics.askWalls.length > 0) {
      lines.push("", "<b>Persistent levels</b>");
      for (const wall of analytics.bidWalls.slice(0, 2)) {
        lines.push(`Bid ${cents(wall.price)} · ${usd(wall.notionalUsd)} · held ${wall.persistenceCount}×`);
      }
      for (const wall of analytics.askWalls.slice(0, 2)) {
        lines.push(`Ask ${cents(wall.price)} · ${usd(wall.notionalUsd)} · held ${wall.persistenceCount}×`);
      }
    }

    if (analytics.crossed) lines.push("", "⚠ The book is crossed.");
  }

  lines.push(
    "",
    `<i>${escapeHtml(outcome.book.transport === "realtime" ? "Live feed" : "REST snapshot")} · ${escapeHtml(view.state.phase)}</i>`,
  );

  return {
    html: lines.join("\n"),
    buttons: navigation(view.resolved.market.id, view.resolved.market.url ?? null),
  };
}

/* ---------------------------------------------------------------------------
   The probability basket
--------------------------------------------------------------------------- */

export async function predictionBasket(query: string): Promise<PredictionView> {
  const view = await liveMarket(query);
  if (view === null) {
    return unavailable("Elyra Probability Basket", `No Polymarket market matched "${query}".`);
  }

  const outcome = [...view.state.outcomes.values()][0];
  const basket = outcome === undefined ? undefined : view.baskets.get(outcome.tokenId);

  if (basket === undefined) {
    return unavailable(
      "Elyra Probability Basket",
      "The basket could not be built from the data available.",
      view.resolved.market.id,
    );
  }

  const lines = [
    "<b>Elyra Probability Basket</b>",
    "",
    escapeHtml(view.resolved.market.question),
    `<b>${escapeHtml(outcome?.outcomeLabel ?? "Outcome")}</b>`,
    "",
    `Observed Mid      ${pct(basket.observedMidpoint)}`,
    `Microprice        ${pct(basket.microprice)}`,
  ];

  if (basket.recentVwap !== null) lines.push(`Recent VWAP       ${pct(basket.recentVwap)}`);
  if (basket.observedLastTrade !== null) {
    lines.push(`Last Trade        ${pct(basket.observedLastTrade)}`);
  }

  if (basket.complementCheck !== null) {
    lines.push(`YES/NO Check      ${pct(basket.complementCheck)}`);
  }

  lines.push("", `<b>Basket            ${pct(basket.basketProbability)}</b>`);

  if (basket.deviationFromAskPoints !== null) {
    lines.push(
      "",
      `Difference vs market  ${signed(basket.deviationFromAskPoints, 1)} pts`,
      `<i>${escapeHtml(
        basket.reading === "market_below_basket"
          ? "The market is priced below the basket."
          : basket.reading === "market_above_basket"
            ? "The market is priced above the basket."
            : "The market and the basket agree within one tick.",
      )}</i>`,
    );
  }

  lines.push("", `<b>Confidence</b>  ${escapeHtml(basket.confidence)}`);

  if (basket.components.length > 0) {
    lines.push("", "<b>Components</b>");
    for (const part of basket.components) {
      lines.push(`· ${escapeHtml(part.label)}  ${pct(part.value)}  ×${part.weight.toFixed(2)}`);
    }
  }

  if (basket.warnings.length > 0) {
    lines.push("", ...basket.warnings.slice(0, 2).map((warning) => `⚠ ${escapeHtml(warning)}`));
  }

  /* The label travels with the number, every time it is shown. */
  lines.push(
    "",
    "<i>An analytical reference built from observable prices — not a guaranteed probability, and not a forecast Elyra is making.</i>",
  );

  return {
    html: lines.join("\n"),
    buttons: navigation(view.resolved.market.id, view.resolved.market.url ?? null),
  };
}

/* ---------------------------------------------------------------------------
   Alert prompt
--------------------------------------------------------------------------- */

export async function predictionAlertPrompt(query: string): Promise<PredictionView> {
  const view = await liveMarket(query);
  if (view === null) {
    return unavailable("Set an alert", `No Polymarket market matched "${query}".`);
  }

  const outcome = [...view.state.outcomes.values()][0];

  return {
    html: [
      "<b>Set an alert</b>",
      "",
      escapeHtml(view.resolved.market.question),
      "",
      `Currently ${cents(outcome?.book.midpoint)} on ${escapeHtml(outcome?.outcomeLabel ?? "the first outcome")}.`,
      "",
      "Reply with a condition, for example:",
      "· <code>alert me if YES breaks 65</code>",
      "· <code>alert me if imbalance is above 0.3</code>",
      "· <code>alert me when this setup enters</code>",
      "· <code>alert me if target is hit</code>",
      "",
      "<i>An alert fires once on the crossing, then re-arms when the condition clears.</i>",
    ].join("\n"),
    buttons: navigation(view.resolved.market.id, view.resolved.market.url ?? null),
  };
}

/* ---------------------------------------------------------------------------
   Routing
--------------------------------------------------------------------------- */

export async function handleSignalCallback(
  context: ToolContext,
  data: string,
): Promise<PredictionView> {
  for (const [key, prefix] of Object.entries(SIGNAL_CALLBACKS)) {
    if (!data.startsWith(prefix)) continue;
    const marketId = marketIdFrom(data, prefix);
    if (marketId === null) break;

    if (key === "signal") return predictionSignal(context, marketId);
    if (key === "book") return predictionOrderbook(marketId);
    if (key === "basket") return predictionBasket(marketId);
    if (key === "alert") return predictionAlertPrompt(marketId);
  }

  return unavailable("Prediction Markets", "That button is no longer valid.");
}
