import "server-only";

import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { ToolArgumentError } from "@/lib/agent/tools/args";
import { bookLine, findBook, groupBooks, toReviewTrade, type Book } from "@/lib/autotrade/books";
import { fundingHistory, hyperliquidCandles, midsFor, perpMeta } from "@/lib/autotrade/hyperliquid";
import {
  agreesWithRecord,
  capitalRecord,
  fundCapital,
  fundingOver,
  intervalFor,
  replay,
  summarise,
  type Bar,
  type ExitChoice,
  type Replay,
  type ReviewTrade,
} from "@/lib/autotrade/review";
import { netPnl } from "@/lib/autotrade/rules";
import { resolveStrategy, STRATEGIES } from "@/lib/backtest/strategies";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The person's own trading record, read back: what a strategy needed in
   capital and booked (`trading_record`), and what a different stop-loss or
   take-profit would have done to the same trades (`trading_what_if`).

   Read-only, like every tool here, and scoped to the caller by the
   ToolContext's userId — no argument names an account. The arithmetic is
   lib/autotrade/review.ts and lib/autotrade/books.ts, tested directly; this
   file only reads and assembles. Every figure is returned rounded to the
   cent, so the reply's figures trace to it.
--------------------------------------------------------------------------- */

const MAX_POSITIONS = 2_000;
const MAX_REPLAYED = 300;
const MAX_LISTED = 30;
const INTERVAL_MS: Record<string, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

const STRATEGY_REFS = STRATEGIES.map((strategy) => ({ id: strategy.id, name: strategy.name }));
const aliasOf = (query: string): string | null => resolveStrategy(query)?.strategy.id ?? null;
const cents = (value: number): number => Math.round(value * 100) / 100;
const iso = (at: number | null): string | null => (at === null ? null : new Date(at).toISOString());

type Mode = "paper" | "live" | null;

function modeOf(value: unknown): Mode {
  if (value === undefined || value === null || value === "" || value === "all") return null;
  if (value === "paper" || value === "live") return value;
  throw new ToolArgumentError('"mode" must be "paper" or "live", or left out for both.');
}

function nameOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ToolArgumentError('"name" must be the name of a rule, a strategy, an AI fund, or "market orders".');
  return value.trim().slice(0, 80) || null;
}

/** An exit as the model sent it: left out (as recorded), "none", or a percent from the entry. */
export function exitChoice(value: unknown, key: string): ExitChoice {
  if (value === undefined || value === null || value === "" || value === "recorded" || value === "same" || value === "keep") return "recorded";
  if (value === false || (typeof value === "string" && /^(none|no|off|without|remove|removed)$/i.test(value.trim()))) return "none";
  const pct = typeof value === "number" ? value : Number(String(value).trim().replace(/%$/, ""));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    throw new ToolArgumentError(`"${key}" must be "none", "recorded", or a percent from the entry between 0 and 100, such as 3.`);
  }
  return pct;
}

const describe = (choice: ExitChoice, what: string): string =>
  choice === "recorded" ? `${what} as each trade had it` : choice === "none" ? `no ${what}` : `${what} at ${choice}% from the entry`;

interface Loaded {
  books: Book[];
  ruleLeverage: Map<string, number>;
  truncated: boolean;
}

async function load(userId: string, mode: Mode): Promise<Loaded> {
  const db = serviceClient();
  const [rules, positions, funds] = await Promise.all([
    db.from("trading_rules").select("id, name, strategy_id, leverage").eq("user_id", userId),
    db.from("trading_positions").select("*").eq("user_id", userId).in("status", ["open", "closed"]).order("opened_at", { ascending: false }).limit(MAX_POSITIONS),
    db.from("ai_funds").select("id, name").eq("user_id", userId),
  ]);
  if (positions.error !== null) throw new Error(`Elyra's trade records could not be read: ${positions.error.message}`);
  if (rules.error !== null) throw new Error(`Elyra's trading rules could not be read: ${rules.error.message}`);
  /* Funds need their own migration; without it there are simply no fund books. */
  const fundRows = funds.error === null ? (funds.data ?? []) : [];
  const rows = (positions.data ?? []).filter((row) => mode === null || row.mode === mode) as TradingPositionRow[];
  return {
    books: groupBooks(rows, rules.data ?? [], fundRows, STRATEGY_REFS),
    ruleLeverage: new Map((rules.data ?? []).map((rule) => [rule.id, rule.leverage])),
    truncated: (positions.data ?? []).length === MAX_POSITIONS,
  };
}

/** The book a name means, or what to ask the person instead. */
async function bookFor(userId: string, args: Record<string, unknown>): Promise<{ book: Book; loaded: Loaded; mode: Mode } | { answer: Record<string, unknown> }> {
  const mode = modeOf(args.mode);
  const name = nameOf(args.name);
  const loaded = await load(userId, mode);
  if (loaded.books.length === 0) {
    return { answer: { found: false, note: `No ${mode === null ? "" : `${mode} `}automation trades are recorded for this account yet.` } };
  }
  const match = findBook(loaded.books, name, STRATEGY_REFS, aliasOf);
  if ("choices" in match) {
    return {
      answer: {
        needsChoice: true,
        asked: name,
        choices: match.choices.map(bookLine).slice(0, 20),
        note:
          name === null
            ? "No name given. Ask which of these the person means, or pass one."
            : "That name fits none of these, or more than one equally. Ask which the person means — do not pick one.",
      },
    };
  }
  return { book: match.book, loaded, mode };
}

const tradesOf = (book: Book, loaded: Loaded): ReviewTrade[] =>
  book.positions.map((row) => toReviewTrade(row, row.rule_id === null ? null : (loaded.ruleLeverage.get(row.rule_id) ?? null)));

function bookHeader(book: Book) {
  const modes = { paper: 0, live: 0 };
  for (const row of book.positions) modes[row.mode] += 1;
  return {
    name: book.name,
    kind: book.kind,
    strategy: book.strategy?.name ?? null,
    coins: [...new Set(book.positions.map((row) => row.coin))],
    paperTrades: modes.paper,
    liveTrades: modes.live,
  };
}

function commonNotes(book: Book, loaded: Loaded, mode: Mode): string[] {
  const notes: string[] = [];
  const header = bookHeader(book);
  if (mode === null && header.paperTrades > 0 && header.liveTrades > 0) {
    notes.push("This book mixes paper and live trades; pass mode to see one alone.");
  }
  const assumed = book.positions.filter((row) => row.leverage === null && (row.rule_id === null || !loaded.ruleLeverage.has(row.rule_id))).length;
  if (assumed > 0) notes.push(`${assumed} trades from before leverage was recorded are taken at 1x.`);
  if (loaded.truncated) notes.push(`Only the most recent ${MAX_POSITIONS} positions on the account were read.`);
  return notes;
}

/* ---------------------------------------------------------------------------
   trading_record
--------------------------------------------------------------------------- */

export const tradingRecord: RegisteredTool = {
  def: {
    name: "trading_record",
    description:
      "The record of one of the caller's automation books — a rule, every rule running a strategy, an AI fund, " +
      'their market orders ("market orders") or limit orders, or "all": trades closed and open, wins and losses, exits ' +
      "by reason (take-profit, stop-loss, liquidation…), realised PnL after fees, and the capital it took. For a rule " +
      "or strategy, capital is derived from the trades — the margin that was open less what closed trades had already " +
      "earned — so `initialUsd` is what had to be there on the first day and each `additions` entry is a later day the " +
      "need rose to a new peak; `returnPct` is realised over that total. For an AI fund it is the fund's real deposits. " +
      "Use it for 'how much capital did my strategy need', 'how has my X rule done', 'what was my return'. Pass the name " +
      "the person used; when the answer is a list of choices, ask which they mean.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: 'The rule, strategy, fund or book, as the person named it — or "all".' },
        mode: { type: "string", enum: ["paper", "live"], description: "Only paper or only live trades. Leave out for both." },
      },
    },
  },

  async execute(args, context) {
    const found = await bookFor(context.userId, args);
    if ("answer" in found) return found.answer;
    const { book, loaded, mode } = found;
    const trades = tradesOf(book, loaded);
    const closed = trades.filter((trade) => trade.closedAt !== null);
    const open = trades.filter((trade) => trade.closedAt === null);

    const byExit: Record<string, number> = {};
    for (const trade of closed) byExit[trade.exitReason ?? "unknown"] = (byExit[trade.exitReason ?? "unknown"] ?? 0) + 1;
    const wins = closed.filter((trade) => (trade.realisedUsd ?? 0) > 0).length;
    const realised = closed.reduce((sum, trade) => sum + (trade.realisedUsd ?? 0), 0) + open.reduce((sum, trade) => sum + trade.partials.reduce((s, p) => s + p.pnlUsd, 0), 0);

    let capital: Record<string, unknown>;
    if (book.kind === "fund") {
      const fundId = book.key.slice("fund:".length);
      const { data, error } = await serviceClient().from("ai_fund_flows").select("kind, amount_usd, created_at").eq("user_id", context.userId).eq("fund_id", fundId);
      if (error !== null) throw new Error(`The fund's deposits could not be read: ${error.message}`);
      capital = {
        basis: "The fund's own deposits and withdrawals, as recorded.",
        ...fundCapital(
          (data ?? []).map((flow) => ({ kind: flow.kind, amountUsd: Number(flow.amount_usd), at: Date.parse(flow.created_at) })),
          realised,
        ),
      };
    } else {
      capital = {
        basis:
          "Derived from the trades in order: the margin open at each moment (size × entry ÷ leverage), less what closed " +
          "trades had already earned. Its first day's peak is the initial capital; each later new peak is an addition. " +
          "Elyra does not hold a rule's money — this is what the account had to have for every trade to open.",
        ...capitalRecord(trades),
      };
    }

    /* Open trades marked at Hyperliquid's mid, as if closed now; testnet's play prices are not marked. */
    const markable = open.filter((trade) => !book.positions.some((row) => row.id === trade.id && row.network === "testnet"));
    const mids = markable.length === 0 ? new Map<string, number>() : await midsFor("mainnet", [...new Set(markable.map((trade) => trade.coin))]).catch(() => new Map<string, number>());
    let unrealised: number | null = markable.length === 0 ? null : 0;
    for (const trade of markable) {
      const mid = mids.get(trade.coin);
      const size = trade.originalSize - trade.partials.reduce((sum, p) => sum + p.size, 0);
      if (mid === undefined || unrealised === null) {
        unrealised = null;
        continue;
      }
      unrealised += netPnl(trade.side, size, trade.entryPrice, mid);
    }

    const times = trades.map((trade) => trade.openedAt).sort((a, b) => a - b);
    return {
      fetchedAt: new Date().toISOString(),
      book: bookHeader(book),
      firstTradeAt: iso(times[0] ?? null),
      lastTradeAt: iso(times.at(-1) ?? null),
      trades: {
        closed: closed.length,
        open: open.length,
        wins,
        losses: closed.length - wins,
        winRatePct: closed.length === 0 ? null : Math.round((wins / closed.length) * 1000) / 10,
        byExit,
        liquidated: byExit.liquidated ?? 0,
      },
      realisedUsd: cents(realised),
      capital,
      openTrades: {
        count: open.length,
        unrealisedUsd: unrealised === null ? null : cents(unrealised),
        ...(markable.length > 0 ? { priceSource: "hyperliquid" } : {}),
      },
      notes: commonNotes(book, loaded, mode),
    };
  },
};

/* ---------------------------------------------------------------------------
   trading_what_if
--------------------------------------------------------------------------- */

export const tradingWhatIf: RegisteredTool = {
  def: {
    name: "trading_what_if",
    description:
      "Replays the closed trades of one of the caller's automation books on Hyperliquid's own candles with a different " +
      "stop-loss and/or take-profit — 'what if I had no stop-loss on my X trades', 'what if my stop had been 5%', 'what if " +
      "I had let winners run'. Each trade runs from its entry until the new exits, a liquidation (isolated margin, the " +
      "backstop a missing stop leaves) or now; one closed by hand or by its exit rule still closes then unless the new " +
      "exits fire first. Returns what was actually booked (`actualBookedUsd`), the replay's booked and still-open-marked-" +
      "to-now results (`totalMarkedToNowUsd`), how each trade would have ended, liquidations, the deepest drawdown a held " +
      "trade would have sat through, the capital the replay would have needed, and an estimate of the funding over the " +
      "extra time held. State its assumptions (in `notes`) with the answer.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: 'The rule, strategy, fund or book, as the person named it — or "all".' },
        stopLoss: {
          type: "string",
          description: '"none" to remove the stop, a percent from the entry such as "5", or leave out to keep each trade\'s own.',
        },
        takeProfit: {
          type: "string",
          description: '"none" to remove the take-profit, a percent from the entry such as "10", or leave out to keep each trade\'s own.',
        },
        mode: { type: "string", enum: ["paper", "live"], description: "Only paper or only live trades. Leave out for both." },
      },
    },
  },

  async execute(args, context) {
    const scenario = { stopLoss: exitChoice(args.stopLoss, "stopLoss"), takeProfit: exitChoice(args.takeProfit, "takeProfit") };
    if (scenario.stopLoss === "recorded" && scenario.takeProfit === "recorded") {
      throw new ToolArgumentError('Say what changes: "stopLoss" and/or "takeProfit", each "none" or a percent from the entry.');
    }
    const found = await bookFor(context.userId, args);
    if ("answer" in found) return found.answer;
    const { book, loaded, mode } = found;
    const notes = commonNotes(book, loaded, mode);

    const testnet = new Set(book.positions.filter((row) => row.mode === "live" && row.network === "testnet").map((row) => row.id));
    const all = tradesOf(book, loaded).filter((trade) => trade.closedAt !== null && trade.entryPrice > 0 && !testnet.has(trade.id));
    if (testnet.size > 0) notes.push(`${testnet.size} live testnet trades are left out: testnet's prices are not the market's, so a replay on Hyperliquid's candles would mean nothing.`);
    /* Newest first from the read; the most recent are the ones replayed. */
    const trades = all.slice(0, MAX_REPLAYED);
    if (all.length > trades.length) notes.push(`Only the ${MAX_REPLAYED} most recent closed trades of ${all.length} are replayed.`);
    if (trades.length === 0) {
      return { fetchedAt: new Date().toISOString(), book: bookHeader(book), trades: 0, note: "This book has no closed trades to replay.", notes };
    }

    const now = Date.now();
    const since = Math.min(...trades.map((trade) => trade.openedAt));
    const interval = intervalFor(since, now);
    if (interval === null) return { book: bookHeader(book), trades: trades.length, note: "These trades go back further than Hyperliquid's candles reach.", notes };
    const step = INTERVAL_MS[interval];

    const coins = [...new Set(trades.map((trade) => trade.coin))];
    const [series, metas, mids] = await Promise.all([
      Promise.all(
        coins.map(async (coin) => {
          const from = Math.min(...trades.filter((trade) => trade.coin === coin).map((trade) => trade.openedAt)) - step;
          const candles = await hyperliquidCandles(coin, interval, from, now).catch(() => []);
          const bars: Bar[] = candles.map((bar) => ({ openTime: bar.openTime, closeTime: bar.closeTime, high: bar.high, low: bar.low, close: bar.close }));
          return [coin, bars] as const;
        }),
      ),
      Promise.all(coins.map(async (coin) => [coin, (await perpMeta("mainnet", coin).catch(() => null))?.maxLeverage ?? null] as const)),
      midsFor("mainnet", coins).catch(() => new Map<string, number>()),
    ]);
    const barsOf = new Map(series);
    const maxLev = new Map(metas);
    const guessed = coins.filter((coin) => maxLev.get(coin) === null);
    if (guessed.length > 0) notes.push(`Hyperliquid's leverage cap for ${guessed.join(", ")} could not be read; its liquidation price assumes a 10x cap.`);

    const replays: Replay[] = [];
    let agree = 0;
    let checked = 0;
    let skipped = 0;
    const byId = new Map(trades.map((trade) => [trade.id, trade]));
    for (const trade of trades) {
      const bars = barsOf.get(trade.coin) ?? [];
      if (bars.length === 0 || bars[0].openTime > trade.openedAt + step) {
        skipped += 1;
        continue;
      }
      const cap = maxLev.get(trade.coin) ?? 10;
      const mark = mids.get(trade.coin) ?? bars.at(-1)?.close ?? trade.entryPrice;
      replays.push(replay(trade, bars, scenario, mark, cap, now));
      const same = agreesWithRecord(trade, bars, cap);
      if (same !== null) {
        checked += 1;
        if (same) agree += 1;
      }
    }
    if (skipped > 0) notes.push(`${skipped} trades are older than the candles Hyperliquid serves at this interval and are left out.`);
    if (replays.length === 0) return { book: bookHeader(book), trades: 0, note: "No trade could be replayed on Hyperliquid's candles.", notes };

    const summary = summarise(replays, { agree, of: checked });

    /* Funding over the extra time held, from Hyperliquid's hourly rates. */
    let fundingUsd = 0;
    let fundingComplete = true;
    const longer = replays.filter((entry) => entry.heldLonger !== null);
    for (const coin of [...new Set(longer.map((entry) => entry.coin))]) {
      const mine = longer.filter((entry) => entry.coin === coin);
      const from = Math.min(...mine.map((entry) => entry.heldLonger!.from));
      const history = await fundingHistory(coin, from, now).catch(() => null);
      if (history === null) {
        fundingComplete = false;
        continue;
      }
      if (!history.complete) fundingComplete = false;
      for (const entry of mine) fundingUsd += fundingOver(entry.heldLonger!, entry.side, history.rates, barsOf.get(coin) ?? []);
    }

    /* The capital the replay would have needed: held trades keep their margin; a liquidation loses it. */
    const replayed = replays.map((entry) => byId.get(entry.id)!);
    const asReplayed: ReviewTrade[] = replays.map((entry) => {
      const trade = byId.get(entry.id)!;
      return {
        ...trade,
        closedAt: entry.exitAt,
        realisedUsd: entry.kind === "still_open" ? null : entry.pnlUsd,
        partials: trade.partials.filter((partial) => entry.exitAt === null || partial.at <= entry.exitAt),
      };
    });

    const changed = replays
      .filter((entry) => entry.kind !== "as_recorded")
      .sort((a, b) => Math.abs(b.pnlUsd - b.actualUsd) - Math.abs(a.pnlUsd - a.actualUsd))
      .slice(0, MAX_LISTED)
      .map((entry) => {
        const trade = byId.get(entry.id)!;
        return {
          coin: entry.coin,
          side: entry.side,
          openedAt: iso(trade.openedAt),
          recorded: { exit: trade.exitReason, closedAt: iso(trade.closedAt), resultUsd: entry.actualUsd },
          replayed: { outcome: entry.kind, at: iso(entry.exitAt), price: Number(entry.exitPrice.toPrecision(6)), resultUsd: entry.pnlUsd, worstUsd: entry.worstUsd },
        };
      });

    notes.push(
      `Replayed on Hyperliquid's ${interval} candles from each entry. Where one candle reached two exits, the worse one is taken.`,
      "Without a stop, a trade ends at its isolated-margin liquidation price (from its leverage and the market's maintenance margin) and loses its margin.",
      "Every later entry is assumed to happen as it did. In fact a trade held longer keeps its margin tied up, and the open-position limit and one live position per coin could have blocked some.",
      "Both figures count the taker fee on entry and exit, as the record does, and neither counts funding; fundingOverExtraHold estimates funding for the time trades would have been held longer.",
      "Trades still open in the replay are marked at Hyperliquid's mid now, as if closed at it.",
    );

    return {
      fetchedAt: new Date().toISOString(),
      book: bookHeader(book),
      scenario: { stopLoss: describe(scenario.stopLoss, "stop-loss"), takeProfit: describe(scenario.takeProfit, "take-profit") },
      candles: { source: "hyperliquid", interval },
      summary: {
        trades: summary.trades,
        actualBookedUsd: summary.actualUsd,
        whatIf: {
          bookedUsd: summary.bookedUsd,
          stillOpenMarkedUsd: summary.markedUsd,
          totalMarkedToNowUsd: summary.totalUsd,
        },
        differenceUsd: cents(summary.totalUsd - summary.actualUsd),
        outcomes: {
          tookProfit: summary.counts.take_profit,
          stoppedOut: summary.counts.stop_loss,
          liquidated: summary.counts.liquidated,
          unchanged: summary.counts.as_recorded,
          stillOpen: summary.counts.still_open,
        },
        deepestDrawdownUsd: summary.worstUsd,
      },
      fundingOverExtraHold: { usd: cents(fundingUsd), complete: fundingComplete, sign: "positive is received, negative is paid" },
      capitalNeeded: {
        actualUsd: capitalRecord(replayed).totalUsd,
        whatIfUsd: capitalRecord(asReplayed).totalUsd,
      },
      calibration: `Replayed with their own exits, ${agree} of ${checked} trades that ended at a stop or take-profit end the same way on these candles.`,
      changed,
      notes,
    };
  },
};

export const TRADING_TOOLS = [tradingRecord, tradingWhatIf];
