import "server-only";

import { jupiterVerifiedTokens } from "@/lib/providers/jupiter";
import { parseBackpackIndex, type SunriseToken } from "@/lib/sunrise/api";

/* ---------------------------------------------------------------------------
   Backpack Securities' tokenized stocks, without Sunrise's key.

   Sunrise (lib/providers/sunrise.ts) is the listing of record for these
   tokens, but its API answers nothing without a key it issues on request.
   The same tokens sit in Jupiter's free token index, tagged `stocks` and
   `backpack` and marked verified, every one frozen by one issuer authority
   (`BACKPACK_FREEZE_AUTHORITY`, lib/sunrise/api.ts). This lists them from
   there, as a deployment without the key's stock list.

   The index is Jupiter's claim. What reaches a wallet is the chain's: a
   trade reads the mint account itself and refuses one whose freeze
   authority is not the issuer's, or whose decimals disagree
   (`checkedDecimals`, lib/sunrise/swap.ts).

   Read once per half hour, keeping only the stocks; a failed refresh serves
   the last good list and says so through `stale`.
--------------------------------------------------------------------------- */

const TTL_MS = 30 * 60_000;

let cache: { at: number; tokens: SunriseToken[] } | null = null;
let inflight: Promise<{ ok: true; data: SunriseToken[] } | { ok: false }> | null = null;

export async function backpackStocks(): Promise<{ ok: true; data: SunriseToken[]; stale?: boolean } | { ok: false }> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return { ok: true, data: cache.tokens };
  inflight ??= jupiterVerifiedTokens()
    .then((result) => {
      if (!result.ok || result.data === undefined) return { ok: false as const };
      const tokens = parseBackpackIndex(result.data);
      if (tokens.length === 0) return { ok: false as const };
      cache = { at: Date.now(), tokens };
      return { ok: true as const, data: tokens };
    })
    .catch(() => ({ ok: false as const }))
    .finally(() => {
      inflight = null;
    });
  const result = await inflight;
  if (!result.ok && cache !== null) return { ok: true, data: cache.tokens, stale: true };
  return result;
}
