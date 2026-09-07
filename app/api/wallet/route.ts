import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { UpstreamError } from "@/lib/market/http";
import { pythConfigured } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import { isSolanaAddress } from "@/lib/solana/address";
import { clusterOf, type Cluster } from "@/lib/solana/cluster";
import {
  RpcUnconfiguredError,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getBalance,
  getGenesisHash,
  getTokenAccountsByOwner,
  rpcConfigured,
} from "@/lib/solana/rpc";
import { resolveTokens, type TokenMeta } from "@/lib/solana/tokens";
import { composeSnapshot } from "@/lib/wallet/compose";
import { foldAccounts } from "@/lib/wallet/fold";
import type { WalletResponse } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The signed-in user's Solana wallet.

   The address comes from the verified session, never from a query parameter.
   That is deliberate: a route that reads any address it is handed is an open
   RPC proxy on someone else's paid endpoint, and the quota is drained by
   whoever finds it first.

   Prices come from two places and the response says which is which. SOL is
   priced by Pyth, this app's source of truth for every market it carries.
   SPL tokens are priced by Jupiter, because Pyth has no feed for most of
   them. Neither is ever guessed: a missing price is null and the holding is
   listed as uncounted.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crypto.SOL/USD.
 *
 * Written out rather than imported from `DEFAULT_ASSET_ID`, which happens to
 * be the same number today but means "the market the terminal opens on". If
 * someone changes the home market to BTC, wallet pricing must not silently
 * follow it.
 */
const SOL_FEED_ID = 6;

function fail(
  error: string,
  { unconfigured = false, status = 200 } = {},
): NextResponse<WalletResponse> {
  return NextResponse.json(
    { wallet: null, error, unconfigured, latencyMs: null },
    { status },
  );
}

export async function GET(request: Request): Promise<NextResponse<WalletResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", { status: 401 });

  const address = user.solanaAddress;
  if (address === null) {
    /* Two different failures wear the same null. Saying "no wallet" to a user
       whose wallet Privy simply could not be reached for sends them looking
       for a problem in their account instead of in this service. */
    return fail(
      user.addressesUnresolved
        ? "Could not reach Privy to resolve this account's wallet address."
        : "This account has no Solana wallet.",
    );
  }
  if (!isSolanaAddress(address)) {
    /* Defence in depth. The address came from Privy, so this should be
       impossible; it is checked because the alternative is putting an
       unvalidated string into an upstream request. */
    return fail("The wallet address on this account is not a valid Solana address.");
  }
  if (!rpcConfigured()) {
    return fail(new RpcUnconfiguredError().message, { unconfigured: true });
  }

  const startedAt = Date.now();
  const [balance, splAccounts, spl2022Accounts, genesis] = await Promise.allSettled([
    getBalance(address),
    getTokenAccountsByOwner(address, TOKEN_PROGRAM_ID),
    getTokenAccountsByOwner(address, TOKEN_2022_PROGRAM_ID),
    /* Cached in the RPC module after the first call, so this is one extra
       request per process rather than one per poll. */
    getGenesisHash(),
  ]);
  const latencyMs = Date.now() - startedAt;

  /* The native balance is the one call that cannot fail softly: without it
     there is no wallet to report. Token accounts failing costs the token
     list, not the panel. */
  if (balance.status === "rejected") {
    const reason: unknown = balance.reason;
    if (reason instanceof RpcUnconfiguredError) {
      return fail(reason.message, { unconfigured: true });
    }
    return NextResponse.json({
      wallet: null,
      error:
        reason instanceof UpstreamError
          ? reason.message
          : "Could not read the wallet balance.",
      unconfigured: false,
      latencyMs,
    });
  }

  const accounts = [
    ...(splAccounts.status === "fulfilled" ? splAccounts.value.value : []),
    ...(spl2022Accounts.status === "fulfilled" ? spl2022Accounts.value.value : []),
  ];
  const byMint = foldAccounts(accounts);

  /* Both upstreams are optional to the answer, so neither may reject it.
     Pyth down means no USD figure; Jupiter down means no tickers. */
  const [metaResult, solPriceResult] = await Promise.allSettled([
    resolveTokens([...byMint.keys()]),
    pythConfigured() ? pricesForIds([SOL_FEED_ID]) : Promise.resolve([]),
  ]);

  const meta: Map<string, TokenMeta> =
    metaResult.status === "fulfilled" ? metaResult.value : new Map();
  const solUsd =
    solPriceResult.status === "fulfilled"
      ? (solPriceResult.value.find((row) => row.id === SOL_FEED_ID)?.price ?? null)
      : null;

  /* An unreachable genesis hash means the cluster is unproven, not that it is
     wrong — "unknown" reads as a warning in the UI, which is the correct
     posture when the check itself could not run. */
  const cluster: Cluster =
    genesis.status === "fulfilled" ? clusterOf(genesis.value) : "unknown";

  const snapshot = composeSnapshot({
    address,
    cluster,
    lamports: balance.value.value,
    slot: balance.value.context.slot,
    held: byMint,
    meta,
    solUsd,
    fetchedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    wallet: snapshot,
    /* A partial answer says so rather than presenting itself as complete. */
    error:
      splAccounts.status === "rejected" && spl2022Accounts.status === "rejected"
        ? "Token balances could not be read; the native balance is current."
        : null,
    unconfigured: false,
    latencyMs,
  });
}
