import "server-only";

import { fail, ok, type ToolResult } from "@/lib/providers/types";
import { SEC_TTL, secJson } from "@/lib/research/sec/client";

/* ---------------------------------------------------------------------------
   Ticker or company name to a CIK.

   ── Why a model never does this ────────────────────────────────────────

   A CIK is a ten-digit identifier with no internal structure and no
   redundancy: 0001045810 is NVIDIA and 0001045811 is somebody else, and there
   is nothing about either number that would let a reader — or a model — catch
   a wrong one. A hallucinated CIK does not error; it fetches a real company's
   real filings and reports them under the name the user asked about.

   So resolution is a lookup against the SEC's own published mapping, and the
   mapping is the only thing allowed to produce a CIK.
--------------------------------------------------------------------------- */

export interface SecEntity {
  /** Ten digits, zero-padded, as the JSON APIs want it. */
  cik: string;
  ticker: string;
  companyName: string;
}

interface TickerRow {
  cik_str?: number;
  ticker?: string;
  title?: string;
}

/** The SEC publishes this as an object keyed by row index, not an array. */
type TickerFile = Record<string, TickerRow>;

async function tickerMap(): Promise<ToolResult<SecEntity[]>> {
  const result = await secJson<TickerFile>(
    "/files/company_tickers.json",
    SEC_TTL.tickers,
    "www",
  );

  if (!result.ok || result.data === undefined) {
    return fail<SecEntity[]>(
      "sec",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "The SEC ticker list could not be read.",
    );
  }

  const rows: SecEntity[] = [];
  for (const row of Object.values(result.data)) {
    if (row.cik_str === undefined || row.ticker === undefined) continue;
    rows.push({
      cik: String(row.cik_str).padStart(10, "0"),
      ticker: row.ticker.toUpperCase(),
      companyName: row.title ?? row.ticker,
    });
  }

  return ok(rows, "sec", { asOf: result.asOf });
}

function normalise(value: string): string {
  return value
    .toUpperCase()
    /* Suffixes carry no identity: "NVIDIA CORP" and "NVIDIA CORPORATION" are
       the same issuer, and the SEC's own titles are inconsistent about it. */
    .replace(/[.,]/g, "")
    .replace(/\b(CORPORATION|CORP|INCORPORATED|INC|COMPANY|CO|LTD|LIMITED|PLC|HOLDINGS|GROUP|THE)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ResolveOutcome {
  entity: SecEntity;
  /** How it was matched, so an ambiguous answer can be explained. */
  matchedOn: "cik" | "ticker" | "exact_name" | "name_prefix";
  /** Other issuers that matched. Non-empty means the answer is a choice. */
  alternatives: SecEntity[];
}

/**
 * Resolves a query to exactly one SEC registrant.
 *
 * Order matters and is not a preference. A bare ticker is the least ambiguous
 * thing a person can type and is tried first; name matching is last because
 * it is the only step that can plausibly match several issuers.
 *
 * When more than one issuer matches, the best is returned WITH the others
 * attached rather than silently chosen — a report about the wrong "Delta" is
 * wrong in a way nothing downstream can detect.
 */
export async function resolveEntity(query: string): Promise<ToolResult<ResolveOutcome>> {
  const raw = query.trim();
  if (raw.length === 0) {
    return fail<ResolveOutcome>("sec", "INVALID_REQUEST", "Nothing to look up.");
  }

  const map = await tickerMap();
  if (!map.ok || map.data === undefined) {
    return fail<ResolveOutcome>(
      "sec",
      map.error?.code ?? "UPSTREAM_UNAVAILABLE",
      map.error?.message ?? "The SEC ticker list could not be read.",
    );
  }

  const rows = map.data;

  /* A bare number is a CIK. Padded and matched exactly — no prefix matching,
     because 1045 must never resolve to 0001045810. */
  if (/^\d{1,10}$/.test(raw)) {
    const cik = raw.padStart(10, "0");
    const hit = rows.find((row) => row.cik === cik);
    if (hit !== undefined) {
      return ok({ entity: hit, matchedOn: "cik", alternatives: [] }, "sec", {
        asOf: map.asOf,
      });
    }
    return fail<ResolveOutcome>("sec", "NOT_FOUND", `No registrant with CIK ${cik}.`);
  }

  const upper = raw.toUpperCase();

  /* A ticker can map to several CIKs — share classes, and reused symbols
     after a delisting. All of them are returned. */
  const byTicker = rows.filter((row) => row.ticker === upper);
  if (byTicker.length > 0) {
    return ok(
      { entity: byTicker[0], matchedOn: "ticker", alternatives: byTicker.slice(1) },
      "sec",
      { asOf: map.asOf },
    );
  }

  const needle = normalise(raw);
  if (needle.length < 2) {
    return fail<ResolveOutcome>("sec", "NOT_FOUND", `No registrant matches "${raw}".`);
  }

  const exact = rows.filter((row) => normalise(row.companyName) === needle);
  if (exact.length > 0) {
    return ok(
      { entity: exact[0], matchedOn: "exact_name", alternatives: exact.slice(1) },
      "sec",
      { asOf: map.asOf },
    );
  }

  /* Prefix, not substring. "APPLE" should find Apple Inc.; it should not find
     "PINEAPPLE ENERGY" — and a substring match would rank them by whatever
     order the file happens to be in. */
  const prefix = rows.filter((row) => normalise(row.companyName).startsWith(needle));
  if (prefix.length > 0) {
    const sorted = [...prefix].sort(
      (a, b) => a.companyName.length - b.companyName.length,
    );
    return ok(
      { entity: sorted[0], matchedOn: "name_prefix", alternatives: sorted.slice(1, 6) },
      "sec",
      { asOf: map.asOf },
    );
  }

  return fail<ResolveOutcome>(
    "sec",
    "NOT_FOUND",
    `No SEC registrant matches "${raw}".`,
  );
}

/* ---------------------------------------------------------------------------
   Lookups for the market-wide feed and the company search.

   The live feed names a filer by CIK only, so the ticker beside it comes
   from the same mapping — never from the filing's text. A filer the mapping
   does not list (a private company, a fund, an individual) has no ticker,
   and is shown by name.
--------------------------------------------------------------------------- */

/** Every listed registrant by CIK. A CIK with several share classes keeps its first ticker. */
export async function entitiesByCik(): Promise<Map<string, SecEntity>> {
  const map = await tickerMap();
  const byCik = new Map<string, SecEntity>();
  for (const row of map.data ?? []) {
    if (!byCik.has(row.cik)) byCik.set(row.cik, row);
  }
  return byCik;
}

/**
 * Registrants matching what someone typed: an exact ticker first, then
 * tickers starting with it, then names starting with it, then names with a
 * word starting with it. One row per company.
 */
export async function searchEntities(query: string, limit = 8): Promise<SecEntity[]> {
  const raw = query.trim();
  if (raw.length === 0) return [];
  const map = await tickerMap();
  const rows = map.data ?? [];
  const upper = raw.toUpperCase();
  const needle = normalise(raw);

  const ranked: Array<{ row: SecEntity; rank: number }> = [];
  for (const row of rows) {
    const name = normalise(row.companyName);
    const rank =
      row.ticker === upper
        ? 0
        : row.ticker.startsWith(upper)
          ? 1
          : needle.length >= 2 && name.startsWith(needle)
            ? 2
            : needle.length >= 3 && name.split(" ").some((word) => word.startsWith(needle))
              ? 3
              : -1;
    if (rank >= 0) ranked.push({ row, rank });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.row.ticker.length - b.row.ticker.length);
  const seen = new Set<string>();
  const results: SecEntity[] = [];
  for (const { row } of ranked) {
    if (seen.has(row.cik)) continue;
    seen.add(row.cik);
    results.push(row);
    if (results.length >= limit) break;
  }
  return results;
}
