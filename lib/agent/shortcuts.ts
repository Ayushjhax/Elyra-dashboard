/* ---------------------------------------------------------------------------
   Shortcuts — the chat's old slash commands, answered by the app.

   Typing "/" in the composer lists them. Each either opens the screen that
   already shows the thing (the portfolio, the swap form prefilled, the alert
   editor prefilled), starts a job (a research report), or — where the app
   has no screen for it — becomes the plain-language question the agent
   answers. Anything that is not a shortcut is sent to the agent as typed.

   Pure: this decides what a line means. The surface decides where each
   screen is and does the opening.
--------------------------------------------------------------------------- */

/** A screen a shortcut opens, by name; the surface maps it to a route. */
export type ShortcutScreen =
  | "portfolio"
  | "wallet"
  | "risk"
  | "defi"
  | "markets"
  | "orders"
  | "fills"
  | "notifications"
  | "settings"
  | "signals"
  | "automation";

/** A Research tab a shortcut opens. */
export type ResearchTab = "reports" | "backtests" | "prediction" | "recap" | "signals" | "yield" | "unlocks" | "sec";

export type Shortcut =
  | { kind: "open"; screen: ShortcutScreen }
  /** One of Research's tabs. */
  | { kind: "research"; tab: ResearchTab }
  /** A market's own screen. */
  | { kind: "asset"; symbol: string }
  /** The swap form, prefilled with whatever was given. */
  | { kind: "swap"; from: string | null; to: string | null; amount: string | null }
  /** The alert editor on a market, prefilled when a level was given. */
  | { kind: "alert"; symbol: string; direction: "above" | "below" | null; target: string | null }
  | { kind: "watch"; op: "add" | "remove"; symbol: string }
  /** A company report, started with this query. */
  | { kind: "report"; symbol: string; query: string }
  /** The list of shortcuts. */
  | { kind: "help" }
  /** Sent to the agent as this text. */
  | { kind: "ask"; prompt: string };

export interface ShortcutEntry {
  command: string;
  /** What follows the command, as the list shows it: "1.5 SOL to USDC". */
  example: string;
  description: string;
}

/** The list "/" shows, in the order the old help listed them. */
export const SHORTCUTS: readonly ShortcutEntry[] = [
  { command: "portfolio", example: "", description: "Total capital across every venue" },
  { command: "wallet", example: "", description: "Your token holdings" },
  { command: "positions", example: "", description: "Exposure and concentration" },
  { command: "defi", example: "", description: "Lending, leverage and vault positions" },
  { command: "markets", example: "SOL", description: "Funding and mark price, or the markets list" },
  { command: "price", example: "SOL", description: "A market's price and chart" },
  { command: "swap", example: "1.5 SOL to USDC", description: "The swap form, filled in" },
  { command: "alert", example: "SOL > 120", description: "Tell me when it crosses" },
  { command: "alerts", example: "", description: "Your price rules, and where they're sent" },
  { command: "watch", example: "add SOL", description: "Your watchlist, or add and remove" },
  { command: "report", example: "NVDA", description: "A sourced company report" },
  { command: "research", example: "", description: "Filings, recap, signals, yield, unlocks" },
  { command: "recap", example: "", description: "What moved" },
  { command: "signals", example: "SOL", description: "Evidence-backed observations" },
  { command: "yield", example: "", description: "Kamino vault rates" },
  { command: "unlocks", example: "", description: "Upcoming token unlocks" },
  { command: "backtest", example: "SOL rsi 12 1h 1y", description: "A historical strategy simulation" },
  { command: "predictions", example: "", description: "Prediction markets and your exposure" },
  { command: "orders", example: "", description: "Resting orders on Hyperliquid" },
  { command: "activity", example: "", description: "Recent fills, with realised PnL" },
  { command: "ask", example: "question", description: "Same as just typing" },
  { command: "settings", example: "", description: "Your account and settings" },
  { command: "help", example: "", description: "This list" },
];

const SYMBOL = /^[A-Za-z][A-Za-z0-9]{0,11}$/;
const NUMBER = /^\d+(?:[.,]\d+)?$/;

function symbolOf(word: string | undefined): string | null {
  return word !== undefined && SYMBOL.test(word) ? word.toUpperCase() : null;
}

function amountOf(word: string | undefined): string | null {
  return word !== undefined && NUMBER.test(word) ? word.replace(",", ".") : null;
}

/** Whether the draft is a shortcut being typed: "/" then letters, nothing else yet. */
export function isShortcutDraft(draft: string): boolean {
  return /^\/[a-z]*$/i.test(draft.trimStart());
}

/** The shortcuts matching what has been typed after "/". */
export function matchingShortcuts(draft: string): ShortcutEntry[] {
  const typed = draft.trimStart().slice(1).toLowerCase();
  return SHORTCUTS.filter((entry) => entry.command.startsWith(typed));
}

/** "/swap 1.5 SOL to USDC" → from, to and amount, each null when not given. */
function swapOf(words: string[]): Shortcut {
  let amount: string | null = null;
  const symbols: string[] = [];
  for (const word of words) {
    if (/^(to|for|into|->|→)$/i.test(word)) continue;
    const number = amountOf(word);
    if (number !== null && amount === null) {
      amount = number;
      continue;
    }
    const symbol = symbolOf(word);
    if (symbol !== null) symbols.push(symbol);
  }
  return { kind: "swap", amount, from: symbols[0] ?? null, to: symbols[1] ?? null };
}

/** "/alert SOL > 120", "/alert SOL below 95", "/alert SOL 120". */
function alertOf(rest: string): Shortcut | null {
  const match = /^([A-Za-z][A-Za-z0-9]{0,11})\s*(>=?|<=?|above|over|below|under)?\s*\$?(\d+(?:[.,]\d+)?)?$/i.exec(rest);
  if (match === null) return null;
  const symbol = match[1].toUpperCase();
  const word = (match[2] ?? "").toLowerCase();
  const target = match[3] === undefined ? null : match[3].replace(",", ".");
  const direction = word === "" ? null : /^(>|>=|above|over)$/.test(word) ? "above" : "below";
  return { kind: "alert", symbol, direction: target === null ? null : direction, target };
}

/**
 * What a sent line means. A line that is not a shortcut — or a shortcut
 * this does not recognise — is asked as it was typed.
 */
export function parseShortcut(raw: string): Shortcut {
  const text = raw.trim();
  const asked: Shortcut = { kind: "ask", prompt: text };
  const match = /^\/([a-z]+)(?:@\S+)?(?:\s+([\s\S]*))?$/i.exec(text);
  if (match === null) return asked;
  const command = match[1].toLowerCase();
  const rest = (match[2] ?? "").trim();
  const words = rest.length > 0 ? rest.split(/\s+/) : [];
  const symbol = symbolOf(words[0]);

  switch (command) {
    case "portfolio":
      return { kind: "open", screen: "portfolio" };
    case "wallet":
      return { kind: "open", screen: "wallet" };
    case "positions":
      return { kind: "open", screen: "risk" };
    case "defi":
      return { kind: "open", screen: "defi" };
    case "orders":
      return { kind: "open", screen: "orders" };
    case "activity":
      return { kind: "open", screen: "fills" };
    case "alerts":
      return { kind: "open", screen: "automation" };
    case "settings":
      return { kind: "open", screen: "settings" };
    case "help":
    case "start":
      return { kind: "help" };
    case "markets":
    case "market":
    case "price":
      return symbol !== null ? { kind: "asset", symbol } : { kind: "open", screen: "markets" };
    case "signals":
      return { kind: "open", screen: "signals" };
    case "swap":
      return swapOf(words);
    case "alert":
      return alertOf(rest) ?? (rest.length === 0 ? { kind: "open", screen: "automation" } : asked);
    case "watch": {
      const op = words[0]?.toLowerCase();
      if ((op === "add" || op === "remove") && symbolOf(words[1]) !== null) {
        return { kind: "watch", op, symbol: symbolOf(words[1]) as string };
      }
      return { kind: "open", screen: "markets" };
    }
    case "report":
      return symbol !== null
        ? { kind: "report", symbol, query: `${symbol} latest earnings` }
        : { kind: "ask", prompt: "Write me a short report on the market right now." };
    case "ask":
      return rest.length > 0 ? { kind: "ask", prompt: rest } : { kind: "help" };
    case "research":
      return rest.length > 0 ? { kind: "ask", prompt: `Research ${rest}.` } : { kind: "research", tab: "reports" };
    case "recap":
      return { kind: "research", tab: "recap" };
    case "yield":
      return { kind: "research", tab: "yield" };
    case "unlocks":
      return { kind: "research", tab: "unlocks" };
    case "predictions":
    case "book":
    case "orderbook":
    case "basket":
    case "fair":
      return { kind: "research", tab: "prediction" };
    case "backtest":
      /* A strategy in words is the agent's to parse and run; the bare
         command opens the tab with its picker. */
      return rest.length > 0 ? { kind: "ask", prompt: `Backtest this strategy: ${rest}.` } : { kind: "research", tab: "backtests" };
    default:
      return asked;
  }
}
