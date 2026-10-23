import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import { parseSwapCommand, previewSwap } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Step one of a swap: quote it, and hand back something signable.

   The taker comes from the SESSION, never from the body. Jupiter builds the
   transaction around whoever it is told will sign, so taking that from the
   request would let a caller have a transaction built against an address
   that is not theirs. It would be unsignable by them and therefore harmless
   on-chain, but it would also let this endpoint be used to probe other
   people's balances — `order` returns 400 for a wallet that cannot afford
   the trade, which makes it an oracle.

   Nothing is persisted and nothing is sent. The response is a price and a
   pile of bytes; only the browser can turn it into a transaction, and only
   by signing it.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const from = typeof body.fromSymbol === "string" ? body.fromSymbol : "";
  const to = typeof body.toSymbol === "string" ? body.toSymbol : "";
  const amount = typeof body.amount === "string" ? body.amount : "";

  /* Parsed by the same function the chat command uses, so "1.5" is held to
     one definition of a valid amount rather than two that can drift. */
  const swap = parseSwapCommand(`${amount} ${from} to ${to}`);
  if (swap === null) {
    return NextResponse.json(
      { error: "That is not a swap I can read." },
      { status: 400 },
    );
  }

  const preview = await previewSwap({
    request: swap,
    solanaAddress: session.solanaAddress,
  });

  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: 400 });
  }

  return NextResponse.json({
    action: preview.action,
    note: preview.note,
    unsignedTransaction: preview.unsignedTransaction ?? null,
    quoteRef: preview.quoteRef ?? null,
    /* The address the order was built for. A wallet holding a different
       address must refuse to sign: Jupiter would reject the bytes anyway,
       and a person with two wallets deserves to be told which one. */
    signer: session.solanaAddress,
  });
}
