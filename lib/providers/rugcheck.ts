import "server-only";

import { parseRugcheck, type RugcheckSummary } from "@/lib/analysis/parse";
import { cached } from "@/lib/market/cache";

/* ---------------------------------------------------------------------------
   Rugcheck — an independent reading of a Solana token's risks, beside
   Elyra's own checks (lib/analysis/score.ts). Public, keyless, cached for
   ten minutes. Its score is Rugcheck's, on its own scale (normalised
   0–100, higher riskier), and is reported as Rugcheck's, never folded into
   Elyra's.
--------------------------------------------------------------------------- */

const TTL_SECONDS = 10 * 60;

export async function rugcheckSummary(mint: string): Promise<RugcheckSummary | null> {
  const result = await cached(`rugcheck:${mint}`, TTL_SECONDS, async () => {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report/summary`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Rugcheck answered ${response.status}.`);
    return parseRugcheck(await response.json());
  });
  return result.value;
}
