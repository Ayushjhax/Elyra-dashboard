import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { recordFill } from "@/lib/invest/server";
import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   Records one landed swap against an Intelligent Portfolio.

   The browser calls this after /api/swap/submit returns a signature for one
   leg of a purchase or a rebalance. It says which portfolio the swap was for
   and nothing else that is believed: lib/invest/server.ts `recordFill` reads
   the transaction from the chain and records the wallet's actual balance
   change, and only for a transaction this account's wallet signed.

   202 for `pending` — the swap may well have landed; the node has not shown
   it yet, and the browser asks again.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasProfile(user)) {
    return NextResponse.json(
      { outcome: "rejected", reason: databaseUnavailableMessage("Portfolio positions") },
      { status: 503 },
    );
  }

  const wallet = user.solanaAddress;
  if (wallet === null || !isSolanaAddress(wallet)) {
    return NextResponse.json(
      { outcome: "rejected", reason: "No Solana wallet is connected to this account." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ outcome: "rejected", reason: "Expected a JSON body." }, { status: 400 });
  }

  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : "";
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";

  const result = await recordFill({ userId: user.userId, wallet, portfolioId, signature });
  const status = result.outcome === "pending" ? 202 : result.outcome === "rejected" ? 422 : 200;
  return NextResponse.json(result, { status });
}
