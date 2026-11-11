import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { suiWalletFor } from "@/lib/auth/sui";
import { composePortfolio } from "@/lib/portfolio/compose";
import { recordSnapshot } from "@/lib/portfolio/history";
import { isSolanaAddress } from "@/lib/solana/address";
import { rpcConfigured } from "@/lib/solana/rpc";
import type { PortfolioResponse } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The signed-in user's portfolio.

   Every address comes from the verified session and never from a query
   parameter — the same rule the wallet route states, for the same reason: a
   route that reads any address it is handed is an open proxy on someone
   else's paid RPC, and the quota is drained by whoever finds it first.

   Scoping to one wallet is a client-side filter over this response rather
   than a parameter here. The set of addresses is the session's either way,
   so a parameter would add an authorisation surface without adding an
   ability.

   This is a read. Nothing under /lib/exchange can place, modify or cancel an
   order, and nothing here signs anything.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(
  error: string,
  { unconfigured = false, status = 200 } = {},
): NextResponse<PortfolioResponse> {
  return NextResponse.json({ portfolio: null, error, unconfigured }, { status });
}

export async function GET(request: Request): Promise<NextResponse<PortfolioResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", { status: 401 });

  const solanaAddress =
    user.solanaAddress !== null && isSolanaAddress(user.solanaAddress)
      ? user.solanaAddress
      : null;

  if (solanaAddress === null && user.walletAddress === null) {
    return fail(
      user.addressesUnresolved
        ? "Could not reach Privy to resolve this account's wallets."
        : "This account has no wallet yet.",
    );
  }

  /* An unset RPC url with no venue to fall back on means there is nothing to
     read at all — reported as a configuration gap rather than as an empty
     portfolio, which would read as "you hold nothing". */
  if (solanaAddress !== null && !rpcConfigured() && user.walletAddress === null) {
    return fail("SOLANA_RPC_URL is not set, so balances cannot be read.", {
      unconfigured: true,
    });
  }

  try {
    const portfolio = await composePortfolio({
      solanaAddress,
      sessionWallet: user.walletAddress,
      /* The Sui wallet, from Privy (lib/auth/sui.ts). An unreachable lookup
         reads as no Sui wallet here; the Sui routes report it themselves. */
      suiAddress: await suiWalletFor(user.privyDid).then((lookup) => (lookup.ok ? (lookup.wallet?.address ?? null) : null)),
      /* Null when the profile store is unreachable. The composer then skips
         stored venue connections and says so in a note, rather than failing
         the whole read — the Solana side needs no database at all. */
      userId: user.userId,
    });

    /* Every read is also a data point. Not awaited and never allowed to
       throw: history is an enhancement to this response, and a portfolio
       that failed because it could not write a point for a chart would be a
       bad trade. A partial read is skipped — a total assembled while a venue
       was down would show up later as a dip that never happened. */
    if (user.userId !== null && !portfolio.partial) {
      void recordSnapshot(user.userId, portfolio.summary.totalValueUsd);
    }

    return NextResponse.json({ portfolio, error: null, unconfigured: false });
  } catch (error: unknown) {
    console.error("[portfolio]", error);
    return fail(
      error instanceof Error ? error.message : "Could not assemble the portfolio.",
    );
  }
}
