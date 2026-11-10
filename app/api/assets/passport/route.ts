import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PassportError, assetPassport } from "@/lib/passport/server";
import type { PassportResponse } from "@/lib/passport/types";
import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   The Asset Passport for one Solana mint: GET /api/assets/passport?mint=…

   Read-only. It describes a token from public sources — the mint account on
   chain, Jupiter's listing, Elyra's verified list — so it needs no ownership
   check, but it does need a signed-in session: an unauthenticated endpoint
   that reads the RPC on request is an open proxy to it.

   Nothing about the caller is read, stored or logged; the mint is the whole
   request.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { PassportResponse } from "@/lib/passport/types";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ passport: null, error: "Not signed in" } satisfies PassportResponse, { status: 401 });

  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!isSolanaAddress(mint)) {
    return NextResponse.json({ passport: null, error: "That is not a Solana mint address." } satisfies PassportResponse, { status: 400 });
  }

  try {
    const passport = await assetPassport(mint);
    return NextResponse.json({ passport, error: null } satisfies PassportResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof PassportError) {
      return NextResponse.json({ passport: null, error: error.message } satisfies PassportResponse, { status: error.status });
    }
    return NextResponse.json({ passport: null, error: "The passport could not be assembled." } satisfies PassportResponse, { status: 500 });
  }
}
