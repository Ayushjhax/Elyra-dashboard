import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { composePortfolio } from "@/lib/portfolio/compose";
import { isRangeKey, portfolioHistory } from "@/lib/portfolio/history";
import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   The performance series, on its own route.

   Separate from /api/portfolio for one reason: resolution. A 1D chart wants
   fifteen-minute candles and a 1Y chart wants daily ones, so the range has to
   reach the server — and folding it into the main portfolio read would mean
   re-fetching every balance, every venue and every price each time someone
   pressed a period tab. §44 asks not to do that. This way a tab switch costs
   one cached candle request and nothing else.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The response type is shared with the website and the app. */
export type { HistoryResponse } from "@/lib/portfolio/types";
import type { HistoryResponse } from "@/lib/portfolio/types";

function empty(error: string | null, status = 200): NextResponse<HistoryResponse> {
  return NextResponse.json(
    { points: [], basis: "none", uncovered: [], coveragePct: 0, error },
    { status },
  );
}

export async function GET(request: Request): Promise<NextResponse<HistoryResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return empty("Not signed in", 401);

  const requested = new URL(request.url).searchParams.get("range") ?? "1M";
  if (!isRangeKey(requested)) return empty("Unknown range");

  const solanaAddress =
    user.solanaAddress !== null && isSolanaAddress(user.solanaAddress)
      ? user.solanaAddress
      : null;

  try {
    /* Holdings are needed for the reconstruction path, and they are the same
       read the portfolio route does — Solana RPC responses are cached
       upstream, so the second caller inside a poll window costs little. */
    const portfolio = await composePortfolio({
      solanaAddress,
      sessionWallet: user.walletAddress,
      userId: user.userId,
    });

    const history = await portfolioHistory(user.userId, portfolio.spot, requested);

    return NextResponse.json({
      points: history.points,
      basis: history.basis,
      uncovered: history.uncovered,
      coveragePct: history.coveragePct,
      error: null,
    });
  } catch (error: unknown) {
    console.error("[portfolio history]", error);
    return empty(
      error instanceof Error ? error.message : "Could not build the performance series.",
    );
  }
}
