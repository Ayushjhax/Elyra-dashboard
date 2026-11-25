import { NextResponse } from "next/server";
import { cleanAddress } from "@/lib/insider/analyze";
import { flaggedCoins, walletNow } from "@/lib/insider/server";
import { rateLimited } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   A flagged wallet's positions now, read live from Hyperliquid (shared for
   half a minute). Only for a wallet Elyra has flagged, so this is never a
   way to read any address through Elyra.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ address: string }>;
}

const READS_PER_MINUTE = 120;

export async function GET(_request: Request, context: Context): Promise<Response> {
  const address = cleanAddress((await context.params).address);
  if (address === null) return NextResponse.json({ error: "That is not a Hyperliquid address." }, { status: 400 });
  if (rateLimited("insider-wallet", READS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many reads just now. Try again in a minute." }, { status: 429 });
  }
  const flagged = await flaggedCoins(address);
  if ("error" in flagged) return NextResponse.json({ error: flagged.error }, { status: flagged.status });
  try {
    return NextResponse.json({ now: await walletNow(address, flagged.coins) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Hyperliquid did not answer. Try again." }, { status: 502 });
  }
}
