import "server-only";

import { backpackStocks } from "@/lib/providers/jupiterStocks";
import { sunriseConfigured, sunriseEquities } from "@/lib/providers/sunrise";
import type { SunriseToken } from "@/lib/sunrise/api";

/* ---------------------------------------------------------------------------
   Which list the tokenized stocks come from.

   With `SUNRISE_API_KEY`, Sunrise's own list for the issuer, quoted across
   Sunrise's routes. Without it, the same issuer's tokens from Jupiter's free
   index (lib/providers/jupiterStocks.ts), quoted by Jupiter. Either way a
   trade asks the same eligibility question (lib/sunrise/eligibility.ts) at
   build and at submit; only the list and the quote differ.
--------------------------------------------------------------------------- */

export type StockSource = "sunrise" | "jupiter";

export const stockSource = (): StockSource => (sunriseConfigured() ? "sunrise" : "jupiter");

export type StockListing =
  | { ok: true; data: SunriseToken[]; source: StockSource; stale?: boolean }
  | { ok: false; source: StockSource };

export async function stockListing(): Promise<StockListing> {
  const source = stockSource();
  const listed = source === "sunrise" ? await sunriseEquities() : await backpackStocks();
  if (!listed.ok) return { ok: false, source };
  return { ok: true, data: listed.data, source, ...(listed.stale === true ? { stale: true } : {}) };
}
