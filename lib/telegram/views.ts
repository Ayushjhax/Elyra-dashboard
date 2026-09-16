import "server-only";

import { executeTool, type ToolContext } from "@/lib/agent/tools/registry";
import { escapeHtml } from "@/lib/personalized/render/telegram";

/* ---------------------------------------------------------------------------
   Deterministic Telegram commands.

   /portfolio, /positions, /markets and the rest answer from the SAME semantic
   tools the model calls. That is the point: `/portfolio` and "what am I
   worth?" must never disagree, and the only way to guarantee that is for both
   to read one implementation.

   No model call. These are tables, the numbers are already computed, and
   paying for a language model to format a table it cannot improve would add
   latency, cost and a chance of the figures changing on the way out.

   Every one of these states when a figure is incomplete. A portfolio total
   rendered as complete while a venue was unreadable is the failure this whole
   layer is built to prevent, and a chat message has no sidebar to put the
   caveat in.
--------------------------------------------------------------------------- */

const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};

const pct = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;

const signed = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${money(value)}`;
};

/** The caveat line, or nothing. Never silence when something failed. */
function incompleteNote(
  incomplete: unknown,
  unreadable: Array<{ scope: string; reason: string }> = [],
): string[] {
  if (incomplete !== true) return [];
  const scopes = unreadable.map((entry) => entry.scope).join(", ");
  return [
    "",
    `<i>Incomplete — ${
      scopes.length > 0 ? `${escapeHtml(scopes)} could not be read` : "a source could not be read"
    }. Totals are a floor, not the full picture.</i>`,
  ];
}

function errorBlock(result: Record<string, unknown>): string | null {
  if (typeof result.error !== "string") return null;
  return `<b>Could not read that.</b>\n${escapeHtml(result.error)}`;
}

/* ------------------------------------------------------------------------- */

export async function portfolioView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("portfolio_overview", {}, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const venues = (result.venues ?? []) as Array<{
    venue: string;
    label: string;
    valueUsd: number | null;
  }>;
  const counts = result.counts as { spot: number; perps: number; defi: number };

  const lines = [
    "<b>Portfolio</b>",
    "",
    `Total: <b>${money(result.totalValueUsd as number | null)}</b>`,
    `Available: ${money(result.availableCapitalUsd as number | null)}`,
    `Open PnL: ${signed(result.unrealizedPnlUsd as number | null)}`,
  ];

  if (venues.length > 0) {
    lines.push("", "<b>Where it sits</b>");
    for (const venue of venues) {
      lines.push(`${escapeHtml(venue.label)}: ${money(venue.valueUsd)}`);
    }
  }

  lines.push(
    "",
    `${counts.spot} token${counts.spot === 1 ? "" : "s"} · ` +
      `${counts.perps} perp${counts.perps === 1 ? "" : "s"} · ` +
      `${counts.defi} DeFi position${counts.defi === 1 ? "" : "s"}`,
  );

  lines.push(
    ...incompleteNote(
      result.incomplete,
      result.unreadable as Array<{ scope: string; reason: string }>,
    ),
  );

  return lines.join("\n");
}

export async function walletView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("portfolio_holdings", { minValueUsd: 1 }, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const holdings = (result.holdings ?? []) as Array<{
    symbol: string;
    venue: string;
    quantity: number;
    valueUsd: number | null;
    change24hPct: number | null;
    counted: boolean;
  }>;

  if (holdings.length === 0) {
    return "<b>Wallet</b>\n\nNothing above $1 to show.";
  }

  const lines = ["<b>Wallet</b>", ""];
  for (const holding of holdings.slice(0, 15)) {
    const change =
      holding.change24hPct === null
        ? ""
        : ` · ${holding.change24hPct >= 0 ? "▲" : "▼"} ${pct(Math.abs(holding.change24hPct), 1)}`;
    /* An unverified token is shown and flagged. Hiding it would be its own
       kind of lie — it really is in the wallet. */
    const flag = holding.counted ? "" : " <i>(unverified — not counted)</i>";
    lines.push(
      `<b>${escapeHtml(holding.symbol)}</b> ${money(holding.valueUsd)}${change}${flag}`,
    );
  }

  if (holdings.length > 15) {
    lines.push("", `<i>…and ${holdings.length - 15} more. Open Elyra for the full list.</i>`);
  }

  lines.push(...incompleteNote(result.incomplete));
  return lines.join("\n");
}

export async function positionsView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("portfolio_risk", {}, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const exposures = (result.largestExposures ?? []) as Array<{
    asset: string;
    exposureUsd: number | null;
    pctOfEquity: number | null;
  }>;

  const lines = [
    "<b>Exposure</b>",
    "",
    `Equity: <b>${money(result.equityUsd as number | null)}</b>`,
    `Gross perp exposure: ${money(result.grossPerpExposureUsd as number | null)}`,
  ];

  if (exposures.length > 0) {
    lines.push("", "<b>Largest positions</b>");
    for (const exposure of exposures.slice(0, 8)) {
      lines.push(
        `${escapeHtml(exposure.asset)}: ${money(exposure.exposureUsd)} · ${pct(
          exposure.pctOfEquity,
          1,
        )} of equity`,
      );
    }
  }

  /* Said every time, because it is the thing most likely to be misread: a
     spot holding and a perp on the same asset are one bet. */
  lines.push(
    "",
    "<i>Spot and perpetual exposure to the same asset are counted together.</i>",
  );
  lines.push(...incompleteNote(result.incomplete));

  return lines.join("\n");
}

export async function defiView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("defi_positions", {}, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const positions = (result.positions ?? []) as Array<{
    protocol: string;
    kind: string;
    label: string;
    netUsd: number | null;
    suppliedUsd: number | null;
    borrowedUsd: number | null;
    ltv: number | null;
    liquidationLtv: number | null;
    pctFromLiquidation: number | null;
  }>;

  const warnings = (result.warnings ?? []) as string[];

  if (positions.length === 0) {
    const lines = ["<b>DeFi</b>", "", "No positions found."];
    /* Critical distinction: "we could not look at your leverage positions"
       must never render the same as "you have none". */
    for (const warning of warnings) lines.push("", `<i>${escapeHtml(warning)}</i>`);
    return lines.join("\n");
  }

  const lines = ["<b>DeFi</b>", ""];
  for (const position of positions) {
    lines.push(`<b>${escapeHtml(position.label)}</b>`);
    lines.push(`  Net: ${money(position.netUsd)}`);
    if (position.borrowedUsd !== null && position.borrowedUsd > 0) {
      lines.push(
        `  Supplied ${money(position.suppliedUsd)} · Borrowed ${money(position.borrowedUsd)}`,
      );
      lines.push(
        position.pctFromLiquidation === null
          ? /* The protocol published no threshold. Saying nothing would read
               as safety; a guess from leverage would read as a measurement. */
            "  Distance to liquidation: <i>not published by the protocol</i>"
          : `  ${pct(position.pctFromLiquidation, 1)} from liquidation` +
            (position.ltv === null
              ? ""
              : ` (LTV ${(position.ltv * 100).toFixed(1)}% of ${(
                  (position.liquidationLtv ?? 0) * 100
                ).toFixed(1)}%)`),
      );
    }
    lines.push("");
  }

  for (const warning of warnings) lines.push(`<i>${escapeHtml(warning)}</i>`);

  return lines.join("\n").trimEnd();
}

export async function ordersView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("open_orders", {}, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const orders = (result.orders ?? []) as Array<{
    venue: string;
    symbol: string;
    side: string;
    size: number;
    limitPrice: number | null;
    orderType: string;
    reduceOnly: boolean;
    triggerPrice: number | null;
  }>;

  const unreadable = (result.unreadable ?? []) as string[];

  const lines = ["<b>Open orders</b>", ""];

  if (orders.length === 0) {
    lines.push("Nothing resting on Hyperliquid.");
  } else {
    for (const order of orders.slice(0, 20)) {
      const arrow = order.side === "buy" ? "Buy" : "Sell";
      const trigger =
        order.triggerPrice === null ? "" : ` · trigger ${money(order.triggerPrice)}`;
      const flag = order.reduceOnly ? " · reduce-only" : "";
      lines.push(
        `<b>${escapeHtml(order.symbol)}</b> ${arrow} ${order.size} @ ${money(order.limitPrice)}`,
        `  ${escapeHtml(order.orderType)}${trigger}${flag}`,
      );
    }
    if (orders.length > 20) {
      lines.push("", `<i>…and ${orders.length - 20} more.</i>`);
    }
  }

  /* The coverage caveat is not optional. Without it "nothing resting" reads
     as covering every venue, including the ones nobody asked. */
  for (const note of unreadable) lines.push("", `<i>${escapeHtml(note)}</i>`);

  return lines.join("\n");
}

export async function activityView(context: ToolContext): Promise<string> {
  const outcome = await executeTool("recent_activity", { limit: 12 }, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const fills = (result.fills ?? []) as Array<{
    symbol: string;
    side: string;
    direction: string;
    price: number;
    size: number;
    realisedPnl: number | null;
    at: string;
  }>;

  const unreadable = (result.unreadable ?? []) as string[];
  const lines = ["<b>Recent fills</b>", ""];

  if (fills.length === 0) {
    lines.push("No recent fills on Hyperliquid.");
  } else {
    for (const fill of fills) {
      const pnl =
        fill.realisedPnl === null || fill.realisedPnl === 0
          ? ""
          : ` · ${fill.realisedPnl >= 0 ? "+" : ""}${money(fill.realisedPnl)}`;
      const when = new Date(fill.at).toISOString().slice(5, 16).replace("T", " ");
      lines.push(
        `<b>${escapeHtml(fill.symbol)}</b> ${escapeHtml(fill.direction || fill.side)} ` +
          `${fill.size} @ ${money(fill.price)}${pnl}`,
        `  <i>${when} UTC</i>`,
      );
    }
  }

  for (const note of unreadable) lines.push("", `<i>${escapeHtml(note)}</i>`);

  return lines.join("\n");
}

export async function marketsView(
  context: ToolContext,
  symbol: string | null,
): Promise<string> {
  if (symbol === null || symbol.length === 0) {
    const outcome = await executeTool("prediction_markets", {}, context);
    const result = outcome.result as Record<string, unknown>;

    const failed = errorBlock(result);
    if (failed !== null) return failed;

    const markets = (result.markets ?? []) as Array<{
      question: string;
      outcomes: Array<{ label: string; impliedProbabilityPct: number }>;
      volume24hUsd: number | null;
    }>;

    if (markets.length === 0) return "<b>Markets</b>\n\nNothing to show right now.";

    const lines = ["<b>What markets are pricing</b>", ""];
    for (const market of markets.slice(0, 5)) {
      const top = market.outcomes
        .slice(0, 2)
        .map((outcome) => `${escapeHtml(outcome.label)} ${outcome.impliedProbabilityPct}%`)
        .join(" · ");
      lines.push(`<b>${escapeHtml(market.question)}</b>`, `  ${top}`, "");
    }
    /* These are prices. Elyra is not forecasting anything. */
    lines.push("<i>Market-implied probabilities, not Elyra forecasts.</i>");
    return lines.join("\n");
  }

  const outcome = await executeTool("perp_market", { symbol }, context);
  const result = outcome.result as Record<string, unknown>;

  const failed = errorBlock(result);
  if (failed !== null) return failed;

  const annual = result.fundingAnnualisedPct as number | null;
  const interval = result.fundingIntervalHours as number | null;

  return [
    `<b>${escapeHtml(String(result.symbol))}</b> <i>${escapeHtml(String(result.source))}</i>`,
    "",
    `Mark: <b>${money(result.markPrice as number | null)}</b>`,
    `Index: ${money(result.indexPrice as number | null)}`,
    "",
    `Funding: ${pct(annual, 2)} a year` +
      (interval === null ? "" : ` (settles every ${interval}h)`),
    result.openInterest === null
      ? ""
      : `Open interest: ${Number(result.openInterest).toLocaleString("en-US")}`,
    "",
    "<i>Positive funding means longs pay shorts.</i>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
