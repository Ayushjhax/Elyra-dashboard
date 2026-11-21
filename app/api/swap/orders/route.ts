import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import { sunriseOrders } from "@/lib/providers/sunrise";
import { isSignature } from "@/lib/sunrise/api";

/* ---------------------------------------------------------------------------
   The person's Sunrise orders: what became of a request-for-quote order a
   tokenized-stock swap placed (lib/sunrise/api.ts). A market maker fills it,
   in part or in whole, or it is cancelled or refunded to the wallet.

   Read for the SESSION's wallet only — never an address from the request —
   and `tx` only narrows that list to one transaction's order. Sunrise lists
   an order about a minute after it lands; until then the list is empty and
   says so.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const wallet = resolved.session.solanaAddress;
  if (wallet === null) return NextResponse.json({ orders: [], note: "No Solana wallet is connected to this account." });

  const tx = new URL(request.url).searchParams.get("tx");
  if (tx !== null && !isSignature(tx)) return NextResponse.json({ error: "That is not a Solana transaction signature." }, { status: 400 });

  const result = await sunriseOrders(wallet);
  if (!result.ok) return NextResponse.json({ error: result.failure.message }, { status: result.failure.status === 503 ? 503 : 502 });

  const orders = tx === null ? result.data : result.data.filter((order) => [order.openTxHash, order.fillTxHash, order.cancelTxHash, order.refundTxHash].includes(tx));
  return NextResponse.json({
    orders: orders.slice(0, 50),
    ...(orders.length === 0 && tx !== null ? { note: "Sunrise lists an order about a minute after it lands." } : {}),
  });
}
