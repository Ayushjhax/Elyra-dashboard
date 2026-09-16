import "server-only";

import {
  fail,
  type DataCapability,
  type ProviderAdapter,
  type SwapQuote,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   DFlow — declared, gated, and deliberately not implemented.

   ── Why there is no adapter body here ──────────────────────────────────

   DFlow's quote endpoint is not publicly reachable. Probed live while
   writing this:

     GET quote-api.dflow.net/quote?...   → 403, zero-length body
     GET quote-api.dflow.net/openapi.json → 403
     docs.dflow.net                       → does not resolve

   A 403 with an empty body and no published schema means two things are
   unknown: what credential it wants, and what it answers with. The brief is
   explicit that live endpoint schemas must not be guessed, and a swap
   aggregator is the worst possible place to guess one — a misread field in a
   route response is a real trade at a price nobody quoted.

   So this file declares the provider and reports precisely why it cannot
   serve, and `providersFor()` never routes to it. Jupiter is configured and
   verified and answers the same question today.

   ── What finishing this requires ───────────────────────────────────────

   1. A DFlow platform credential in `DFLOW_API_KEY` (server-side only —
      never `NEXT_PUBLIC_`).
   2. The response schema from DFlow's own documentation, confirmed against
      a live authenticated call.
   3. `dflowSwapQuote` written against that schema, uncached and unretried,
      exactly as `jupiterSwapQuote` is: a retry is a different price.

   Until then this returns UNSUPPORTED, which surfaces as "DFlow is not
   connected" — a true statement — rather than an empty route list, which
   would read as "DFlow has no route for this pair".
--------------------------------------------------------------------------- */

function apiKey(): string | undefined {
  const raw = process.env.DFLOW_API_KEY?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

export const dflowProvider: ProviderAdapter = {
  id: "dflow",
  capabilities: ["swap_quote"] as const satisfies readonly DataCapability[],
  /* False even with a key present: a credential does not supply the schema
     the adapter would need to read the response correctly. */
  configured: () => false,
};

/** Whether a credential exists, for a settings screen to report accurately. */
export function dflowCredentialPresent(): boolean {
  return apiKey() !== undefined;
}

export async function dflowSwapQuote(): Promise<ToolResult<SwapQuote>> {
  return fail<SwapQuote>(
    "dflow",
    "UNSUPPORTED",
    "DFlow is not connected. Its quote API requires a platform credential and publishes no public schema, so routing through it is not enabled.",
  );
}
