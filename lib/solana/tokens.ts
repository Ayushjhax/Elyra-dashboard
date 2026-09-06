import "server-only";

import { fetchJson } from "@/lib/market/http";

/* ---------------------------------------------------------------------------
   What an SPL mint actually is.

   `getTokenAccountsByOwner` returns mints and raw amounts. A mint address is
   not a ticker, and there is no on-chain field that reliably gives one — the
   name and symbol live in metadata accounts that anyone can write. So this
   resolves mints against Jupiter's token index rather than a hand-written
   table: a table of mint addresses typed from memory is a table of guesses,
   and one transposed character mislabels a real holding as a different asset.

   ── Why two tiers ───────────────────────────────────────────────────────

   The obvious design — ask Jupiter about each held mint — does not survive
   contact with a real wallet. Measured against a live mainnet address, one
   owner held **3,069 distinct mints**, almost all of them unsolicited
   airdrops. At Jupiter's 50-per-request cap that is 62 requests on every
   thirty-second poll, which is abusive and would be rate-limited within a
   minute.

   So the lookup is inverted. The set of *verified* tokens is 3,191 entries
   and is fetched whole, once every six hours: one request, whatever the
   wallet holds. Held mints are then matched against it in memory, and only
   the matches — realistically a handful — cost a price request. A wallet
   with three thousand spam mints now costs exactly the same as a wallet
   with three.

   ── Scam tokens ─────────────────────────────────────────────────────────

   That same index is what makes the balance trustworthy. Airdropping a mint
   named "USDC" at a wallet costs a few cents, and the live wallet above was
   full of exactly that. A mint absent from the verified index is still shown
   — it is genuinely in the wallet — but it carries no symbol from its own
   metadata and never contributes to a USD total, so no airdrop can move the
   figure this dashboard displays.

   Prices here are Jupiter's, not Pyth's. Pyth is this app's source of truth
   for the markets it carries, and SOL is priced there; Jupiter covers the
   long tail Pyth has no feed for. Anything mixing the two says which is which.
--------------------------------------------------------------------------- */

export interface TokenMeta {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Jupiter's USD price. Null when the token has no priceable market. */
  usdPrice: number | null;
  icon: string | null;
  /**
   * Present in Jupiter's verified index.
   *
   * Always true for anything this function returns — an unverified mint is
   * simply absent from the result, and the caller renders it by address.
   * Kept as a field so the shape says what it means at the call site.
   */
  verified: boolean;
}

/**
 * Jupiter's `price/v3` silently truncates at 50 ids.
 *
 * Measured, not read from documentation: a request for 100 returns 50 with
 * HTTP 200 and no indication that anything was dropped. Chunking above this
 * would leave half a wallet unpriced with nothing to signal it, so the size
 * is a hard rule rather than a tuning knob.
 */
const PRICE_CHUNK = 50;

/** Metadata does not move. The list is 4.7MB, so it is fetched rarely. */
const INDEX_TTL_MS = 6 * 60 * 60_000;

/** Matches the 60s price cache the wallet surface promises. */
const PRICE_TTL_MS = 60_000;

/**
 * Ceiling on priced holdings per wallet, in requests of `PRICE_CHUNK`.
 *
 * Only verified tokens get here, and there are only ~3,200 in existence, so
 * a wallet reaching this is a treasury rather than a person. Past it the
 * holdings are still listed; they are simply unpriced and reported as
 * uncounted, which is the same honest state as a token with no market.
 */
const MAX_PRICED = 250;

interface IndexEntry {
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
}

let index: Map<string, IndexEntry> | null = null;
let indexAt = 0;
/** Coalesces concurrent misses so a cold start makes one 4.7MB request, not N. */
let indexInFlight: Promise<Map<string, IndexEntry> | null> | null = null;

const priceCache = new Map<string, { price: number | null; at: number }>();

interface JupiterToken {
  id: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  icon?: string | null;
}

async function fetchIndex(): Promise<Map<string, IndexEntry> | null> {
  try {
    const tokens = await fetchJson<JupiterToken[]>({
      source: "jupiter-verified",
      url: "https://lite-api.jup.ag/tokens/v2/tag?query=verified",
      /* Larger than the default: this is several megabytes, and a timeout
         here costs every ticker in the panel for the next six hours. */
      timeoutMs: 20_000,
    });

    const next = new Map<string, IndexEntry>();
    for (const token of tokens) {
      /* Someone else's API, so every field is optional in the type. A token
         with no symbol or no decimals cannot be rendered as a balance and is
         skipped rather than shown with a blank ticker. */
      if (typeof token.symbol !== "string" || typeof token.decimals !== "number") {
        continue;
      }
      next.set(token.id, {
        symbol: token.symbol,
        name: token.name ?? token.symbol,
        decimals: token.decimals,
        icon: token.icon ?? null,
      });
    }
    return next;
  } catch {
    return null;
  }
}

async function verifiedIndex(): Promise<Map<string, IndexEntry> | null> {
  const now = Date.now();
  if (index !== null && now - indexAt < INDEX_TTL_MS) return index;
  if (indexInFlight !== null) return indexInFlight;

  indexInFlight = fetchIndex()
    .then((next) => {
      if (next !== null) {
        index = next;
        indexAt = Date.now();
      }
      /* A failed refresh keeps the previous index rather than dropping every
         ticker: stale metadata is still correct metadata. */
      return index;
    })
    .finally(() => {
      indexInFlight = null;
    });

  return indexInFlight;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type PriceResponse = Record<string, { usdPrice?: number | null } | undefined>;

/** Fresh prices for a bounded set of mints. Misses are cached too, as null. */
async function pricesFor(mints: string[]): Promise<Map<string, number | null>> {
  const now = Date.now();
  const out = new Map<string, number | null>();
  const missing: string[] = [];

  for (const mint of mints) {
    const hit = priceCache.get(mint);
    if (hit !== undefined && now - hit.at < PRICE_TTL_MS) out.set(mint, hit.price);
    else missing.push(mint);
  }

  if (missing.length === 0) return out;

  const batches = await Promise.all(
    chunk(missing, PRICE_CHUNK).map(async (group) => {
      try {
        return await fetchJson<PriceResponse>({
          source: "jupiter-price",
          url: `https://lite-api.jup.ag/price/v3?ids=${group.join(",")}`,
          timeoutMs: 5_000,
        });
      } catch {
        return {} as PriceResponse;
      }
    }),
  );

  const merged: PriceResponse = Object.assign({}, ...batches) as PriceResponse;

  for (const mint of missing) {
    const raw = merged[mint]?.usdPrice;
    const price = typeof raw === "number" ? raw : null;
    /* Cached either way. A token with no market must not be re-asked about
       every thirty seconds for the rest of the session. */
    priceCache.set(mint, { price, at: now });
    out.set(mint, price);
  }

  return out;
}

/**
 * Resolve mints to metadata and price.
 *
 * Never throws: an upstream failure leaves the affected mints unresolved and
 * the caller renders them by address. A wallet panel missing one ticker is a
 * far better outcome than a wallet panel that fails to load.
 *
 * Only verified mints appear in the result. See the header for why.
 */
export async function resolveTokens(
  mints: readonly string[],
): Promise<Map<string, TokenMeta>> {
  const resolved = new Map<string, TokenMeta>();

  const known = await verifiedIndex();
  if (known === null) return resolved;

  /* Sorted so that a wallet past MAX_PRICED drops the same holdings on every
     poll — an unstable choice would make tokens flicker in and out. */
  const held = [...new Set(mints)].filter((mint) => known.has(mint)).sort();
  const priced = held.slice(0, MAX_PRICED);
  const prices = await pricesFor(priced);

  for (const mint of held) {
    const entry = known.get(mint);
    if (entry === undefined) continue;
    resolved.set(mint, {
      mint,
      symbol: entry.symbol,
      name: entry.name,
      decimals: entry.decimals,
      usdPrice: prices.get(mint) ?? null,
      icon: entry.icon,
      verified: true,
    });
  }

  return resolved;
}

/** Test seam. Both caches are module state and would otherwise leak across tests. */
export function clearTokenCache(): void {
  index = null;
  indexAt = 0;
  priceCache.clear();
}
