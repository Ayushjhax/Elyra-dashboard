import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { PositionsUnavailableError, pricedCatalog, readPositions } from "@/lib/invest/server";
import type { InvestResponse, PositionUnits } from "@/lib/invest/types";

/* ---------------------------------------------------------------------------
   Intelligent Portfolios: the catalog with live prices, and — for a signed-in
   caller — what their proven fills hold in each.

   The catalog and its prices are the same for everyone, so a signed-out
   visitor gets them too; positions are added only for a verified session,
   and the user is the token's, never the request's.

   Mints are included. They are what a wallet balance is matched by — a
   symbol match is how a lookalike token named "NVDAon" would be counted as
   the real one — and they cannot be used to trade: /api/swap/build takes a
   symbol and resolves it on the server.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { InvestResponse } from "@/lib/invest/types";

export async function GET(request: Request): Promise<Response> {
  const [catalog, user] = await Promise.all([
    pricedCatalog(),
    getSessionUser(request).catch(() => null),
  ]);

  let positions: Record<string, PositionUnits> | null = null;
  let positionsError: string | null = null;

  if (user !== null) {
    if (!hasProfile(user)) {
      positionsError = databaseUnavailableMessage("Portfolio positions");
    } else {
      try {
        positions = await readPositions(user.userId);
      } catch (error: unknown) {
        positionsError =
          error instanceof PositionsUnavailableError ? error.message : "Your portfolio positions could not be read.";
      }
    }
  }

  const body: InvestResponse = {
    portfolios: catalog.portfolios,
    positions,
    positionsError,
    pricedAt: catalog.pricedAt,
    error: catalog.warning,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
