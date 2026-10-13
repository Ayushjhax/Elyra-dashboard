/* ---------------------------------------------------------------------------
   Where an answer's figures came from, and what the agent is doing.

   Every market tool returns the source it read (`source`, `priceSource`,
   `statsSource`, a venue), and every account tool reads the person's own
   connected accounts. This collects those into the short "Sources" line
   under a reply — read from what the tools actually returned, not from
   anything the model wrote, so it cannot cite a source it did not use.

   Pure, so it is tested directly.
--------------------------------------------------------------------------- */

const LABELS: Record<string, string> = {
  pyth: "Pyth",
  binance: "Binance",
  hyperliquid: "Hyperliquid",
  okx: "OKX",
  bybit: "Bybit",
  coinbase: "Coinbase",
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  jupiter: "Jupiter",
  defillama: "DefiLlama",
  yahoo: "Yahoo Finance",
  solana: "Solana RPC",
  wallet: "Your wallet",
};

const SOURCE_KEY = /^(source|priceSource|statsSource|venue|exchange|provider)$/;

/** Tools that read the person's own accounts rather than a public market. */
const ACCOUNT_TOOL = /^(get_positions|get_watchlist|get_portfolio_summary|portfolio_|open_orders|recent_activity|defi_positions|prediction_get_(positions|portfolio_summary|exposure|expiring_positions|activity|open_orders|position)$)/;

function label(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (key.length === 0 || key.length > 40) return null;
  return LABELS[key] ?? null;
}

function collect(value: unknown, into: Set<string>, depth: number): void {
  if (depth > 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 50)) collect(entry, into, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && SOURCE_KEY.test(key)) {
      const name = label(entry);
      if (name !== null) into.add(name);
    } else {
      collect(entry, into, depth + 1);
    }
  }
}

/**
 * The sources behind a run's tool results, most specific first. Only names
 * this file knows are reported — an unrecognised string in a `source` field
 * is not repeated to the person as if it were a citation.
 */
export function sourcesFrom(results: ReadonlyArray<{ name: string; result: unknown }>): string[] {
  const found = new Set<string>();
  let account = false;
  for (const { name, result } of results) {
    if (ACCOUNT_TOOL.test(name)) account = true;
    collect(result, found, 0);
  }
  const list = [...found];
  if (account) list.push("Your connected accounts");
  return list.slice(0, 6);
}

/** "get_market_snapshot" → "Market snapshot", for the working line. */
export function toolLabel(name: string): string {
  const words = name
    .replace(/^(get_|prediction_get_|prediction_)/, "")
    .replace(/_/g, " ")
    .trim();
  const text = words.length > 0 ? words : name;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
