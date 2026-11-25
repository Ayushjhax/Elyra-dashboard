import type { Side } from "@/lib/autotrade/rules";
import type { ReviewTrade } from "@/lib/autotrade/review";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   A person's trades, as the books they ask about by name. Pure.

   People name what they ran, not how it is stored: "my Volume Anchor
   Trend", "the RSI one", "my fund", "the trades I made by hand". So every
   position belongs to one book — its rule, its AI fund, the market orders
   placed by hand, the limit orders, an outside agent — and a strategy
   gathers every rule that runs it. `findBook` matches what was said against
   those names; a name that fits more than one book is returned as the
   choices, never guessed between.
--------------------------------------------------------------------------- */

export type BookKind = "rule" | "strategy" | "fund" | "market_orders" | "limit_orders" | "agent" | "other" | "all";

export interface Book {
  key: string;
  kind: BookKind;
  name: string;
  strategy: { id: string; name: string } | null;
  positions: TradingPositionRow[];
}

export interface RuleRef {
  id: string;
  name: string;
  strategy_id: string;
  leverage: number;
}

export interface FundRef {
  id: string;
  name: string;
}

export interface StrategyRef {
  id: string;
  name: string;
}

const MARKET_ORDERS = "Market orders (by hand)";
const LIMIT_ORDERS = "Limit orders";

/** Every position in exactly one book. */
export function groupBooks(
  positions: readonly TradingPositionRow[],
  rules: readonly RuleRef[],
  funds: readonly FundRef[],
  strategies: readonly StrategyRef[],
): Book[] {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const strategyById = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const books = new Map<string, Book>();
  const add = (key: string, make: () => Omit<Book, "positions">, row: TradingPositionRow) => {
    const book = books.get(key) ?? { ...make(), positions: [] };
    book.positions.push(row);
    books.set(key, book);
  };

  for (const row of positions) {
    if (row.fund_id !== null && row.fund_id !== undefined) {
      const fund = fundById.get(row.fund_id);
      add(`fund:${row.fund_id}`, () => ({ key: `fund:${row.fund_id}`, kind: "fund", name: fund?.name ?? row.rule_name, strategy: null }), row);
    } else if (row.rule_id !== null) {
      const rule = ruleById.get(row.rule_id);
      const strategy = rule === undefined ? null : (strategyById.get(rule.strategy_id) ?? { id: rule.strategy_id, name: rule.strategy_id });
      add(`rule:${row.rule_id}`, () => ({ key: `rule:${row.rule_id}`, kind: "rule", name: rule?.name ?? row.rule_name, strategy }), row);
    } else if (row.origin === "order" || /^Limit (long|short)\b/.test(row.rule_name)) {
      add("limit", () => ({ key: "limit", kind: "limit_orders", name: LIMIT_ORDERS, strategy: null }), row);
    } else if (/^Market (long|short)\b/.test(row.rule_name)) {
      add("market", () => ({ key: "market", kind: "market_orders", name: MARKET_ORDERS, strategy: null }), row);
    } else if (row.rule_name.startsWith("Agent: ")) {
      add(`agent:${row.rule_name}`, () => ({ key: `agent:${row.rule_name}`, kind: "agent", name: row.rule_name, strategy: null }), row);
    } else {
      /* A rule since deleted keeps its name on its positions. */
      add(`name:${row.rule_name}`, () => ({ key: `name:${row.rule_name}`, kind: "other", name: row.rule_name, strategy: null }), row);
    }
  }
  return [...books.values()];
}

const normal = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim();

const ALL = /^(all|everything|overall|all (my )?(trades|positions|strategies|rules))$/;

/** How well a name fits what was said: 3 exact, 2 contains it, 1 every word present, 0 not at all. */
export function nameScore(name: string, query: string): number {
  const a = normal(name);
  const q = normal(query);
  if (q.length === 0 || a.length === 0) return 0;
  if (a === q) return 3;
  if (a.includes(q)) return 2;
  const words = a.split(" ");
  const asked = q.split(" ").filter((word) => word.length > 1);
  return asked.length > 0 && asked.every((word) => words.some((have) => have.startsWith(word))) ? 1 : 0;
}

/** Every rule book that runs a strategy, as one book. */
export function strategyBook(books: readonly Book[], strategy: StrategyRef): Book | null {
  const rules = books.filter((book) => book.kind === "rule" && book.strategy?.id === strategy.id);
  if (rules.length === 0) return null;
  return { key: `strategy:${strategy.id}`, kind: "strategy", name: strategy.name, strategy, positions: rules.flatMap((book) => book.positions) };
}

export type BookMatch = { book: Book } | { choices: Book[] };

/**
 * The book a name means. `aliasOf` resolves a strategy's informal name
 * ("rsi", "vwap"), and ranks below a name the person gave a rule. With no
 * name, or one that fits several books equally, the books are the choices.
 */
export function findBook(books: readonly Book[], query: string | null, strategies: readonly StrategyRef[], aliasOf: (query: string) => string | null): BookMatch {
  if (query === null || normal(query).length === 0) return { choices: [...books] };
  if (ALL.test(normal(query))) {
    return { book: { key: "all", kind: "all", name: "All trades", strategy: null, positions: books.flatMap((book) => book.positions) } };
  }

  const scored: Array<{ book: Book; score: number }> = [];
  for (const book of books) {
    const score = nameScore(book.name, query);
    if (score > 0) scored.push({ book, score: score + 0.5 });
  }
  const used = new Set(books.flatMap((book) => (book.strategy === null ? [] : [book.strategy.id])));
  for (const strategy of strategies) {
    if (!used.has(strategy.id)) continue;
    const score = Math.max(nameScore(strategy.name, query), normal(strategy.id) === normal(query) ? 3 : 0);
    const alias = aliasOf(query) === strategy.id ? 1 : 0;
    const best = Math.max(score, alias);
    const book = best > 0 ? strategyBook(books, strategy) : null;
    if (book !== null) scored.push({ book, score: best });
  }
  if (scored.length === 0) return { choices: [...books] };

  const top = Math.max(...scored.map((entry) => entry.score));
  /* The same trades under two names (a strategy run by one rule) are one answer. */
  const seen = new Set<string>();
  const best = scored
    .filter((entry) => entry.score === top)
    .map((entry) => entry.book)
    .filter((book) => {
      const ids = book.positions.map((row) => row.id).sort().join(",");
      if (seen.has(ids)) return false;
      seen.add(ids);
      return true;
    });
  return best.length === 1 ? { book: best[0] } : { choices: best };
}

const num = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** A stored position as a trade to review. `ruleLeverage` covers rows from before leverage was stored. */
export function toReviewTrade(row: TradingPositionRow, ruleLeverage: number | null): ReviewTrade {
  const partials = Array.isArray(row.partial_closes)
    ? (row.partial_closes as Array<Record<string, unknown>>)
        .map((entry) => ({ at: Date.parse(String(entry.at)), size: Number(entry.size), pnlUsd: Number(entry.pnlUsd) }))
        .filter((entry) => Number.isFinite(entry.at) && entry.size > 0 && Number.isFinite(entry.pnlUsd))
        .sort((a, b) => a.at - b.at)
    : [];
  const size = num(row.size) ?? 0;
  return {
    id: row.id,
    coin: row.coin,
    side: row.side as Side,
    entryPrice: num(row.entry_price) ?? 0,
    originalSize: num(row.original_size) ?? size + partials.reduce((sum, entry) => sum + entry.size, 0),
    leverage: row.leverage ?? ruleLeverage ?? 1,
    takeProfit: num(row.take_profit) ?? 0,
    stopLoss: num(row.stop_loss) ?? 0,
    openedAt: Date.parse(row.opened_at),
    closedAt: row.status === "closed" && row.closed_at !== null ? Date.parse(row.closed_at) : null,
    exitPrice: num(row.exit_price),
    exitReason: row.exit_reason,
    realisedUsd: num(row.realised_pnl_usd),
    partials,
  };
}

/** A book's name and what is in it, for a list of choices. */
export function bookLine(book: Book): { name: string; kind: BookKind; strategy: string | null; closed: number; open: number; coins: string[] } {
  return {
    name: book.name,
    kind: book.kind,
    strategy: book.strategy?.name ?? null,
    closed: book.positions.filter((row) => row.status === "closed").length,
    open: book.positions.filter((row) => row.status === "open").length,
    coins: [...new Set(book.positions.map((row) => row.coin))].slice(0, 8),
  };
}
