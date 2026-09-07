import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { UpstreamError } from "@/lib/market/http";
import { isSolanaAddress } from "@/lib/solana/address";
import {
  RpcUnconfiguredError,
  getSignaturesForAddress,
  rpcConfigured,
} from "@/lib/solana/rpc";
import {
  activityStatus,
  type ActivityResponse,
  type WalletActivity,
} from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the signed-in wallet.

   `getSignaturesForAddress` and nothing else. Decoding each transaction into
   "sent 2 SOL to X" needs a `getTransaction` per signature plus an instruction
   parser per program, which is a different piece of work and a much larger
   RPC bill. What is here is what the signature list actually contains:
   whether it landed, when, and a link to the explorer for the rest.

   Saying less and being right is the trade. A feed that guessed at transfer
   amounts from partial data would be wrong on exactly the transactions that
   matter — the unusual ones.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function fail(
  error: string,
  { unconfigured = false, status = 200 } = {},
): NextResponse<ActivityResponse> {
  return NextResponse.json({ items: [], error, unconfigured }, { status });
}

export async function GET(request: Request): Promise<NextResponse<ActivityResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", { status: 401 });

  const address = user.solanaAddress;
  if (address === null) {
    /* See the same branch in /api/wallet: an unreachable Privy and an account
       with no wallet are different failures and must not share a message. */
    return fail(
      user.addressesUnresolved
        ? "Could not reach Privy to resolve this account's wallet address."
        : "This account has no Solana wallet.",
    );
  }
  if (!isSolanaAddress(address)) {
    return fail("The wallet address on this account is not a valid Solana address.");
  }
  if (!rpcConfigured()) {
    return fail(new RpcUnconfiguredError().message, { unconfigured: true });
  }

  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return fail(`limit must be an integer in 1..${MAX_LIMIT}`);
  }

  let signatures;
  try {
    signatures = await getSignaturesForAddress(address, limit);
  } catch (error: unknown) {
    if (error instanceof RpcUnconfiguredError) {
      return fail(error.message, { unconfigured: true });
    }
    return fail(
      error instanceof UpstreamError
        ? error.message
        : "Could not read transaction history.",
    );
  }

  const items: WalletActivity[] = signatures.map((entry) => ({
    signature: entry.signature,
    status: activityStatus(entry.err, entry.confirmationStatus),
    slot: entry.slot,
    /* blockTime is unix SECONDS. Passing it to Date as milliseconds would
       date every transaction to January 1970. */
    at: entry.blockTime === null ? null : new Date(entry.blockTime * 1000).toISOString(),
    memo: entry.memo,
  }));

  return NextResponse.json({ items, error: null, unconfigured: false });
}
