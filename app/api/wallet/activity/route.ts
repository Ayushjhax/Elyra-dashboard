import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { suiWalletFor } from "@/lib/auth/sui";
import { isEvmAddress } from "@/lib/evm/chains";
import { readAccountActivity } from "@/lib/wallet/readActivity";
import type { ActivityResponse } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the signed-in account's wallets.

   The reading itself — Solana, the EVM chains and Sui side by side, merged
   newest first, with any source that could not be read named in `notes` —
   is lib/wallet/readActivity.ts, shared with the portfolio's flow tracking.
   This route supplies the session's own addresses and nothing else: an
   address never comes from the request.
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

  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return fail(`limit must be an integer in 1..${MAX_LIMIT}`);
  }

  const suiLookup = await suiWalletFor(user.privyDid);
  const read = await readAccountActivity({
    solanaAddress: user.solanaAddress,
    addressesUnresolved: user.addressesUnresolved,
    evmAddress: isEvmAddress(user.walletAddress) ? user.walletAddress : null,
    suiAddress: suiLookup.ok && suiLookup.wallet !== null ? suiLookup.wallet.address : null,
    limit,
  });

  if (read.error !== null) return fail(read.error, { unconfigured: read.unconfigured });

  return NextResponse.json({
    items: read.items,
    error: null,
    unconfigured: false,
    ...(read.notes !== undefined && read.notes.length > 0 ? { notes: read.notes } : {}),
  });
}
