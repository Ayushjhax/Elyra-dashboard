import { NextResponse } from "next/server";
import { jupiterSwapExecute } from "@/lib/providers/jupiter";
import { resolve } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   Step two of a swap: submit what the operator signed.

   This is the only path in the app that can move funds, and the reason it is
   safe to have is that it cannot move them on its own. It takes bytes that
   are already signed, by a key this server has never seen, in the operator's
   own browser. Without that signature the bytes are inert, so a bug here —
   or a caller who reaches it — cannot spend anything.

   The signed transaction is forwarded verbatim. It is never decoded,
   inspected or rebuilt: what the operator signed is exactly what gets
   submitted, and anything this server did to it in between would be a
   difference nobody consented to.

   `requestId` pairs the signature with the order that produced it. Jupiter
   rejects a mismatch, which is what stops bytes signed for one quote from
   being submitted against another.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous, but bounded — a swap transaction is a few kilobytes at most. */
const MAX_TRANSACTION_CHARS = 8_192;

export async function POST(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const signedTransaction = body.signedTransaction;
  const quoteRef = body.quoteRef;

  if (typeof signedTransaction !== "string" || signedTransaction.length === 0) {
    return NextResponse.json(
      { error: "No signed transaction was supplied." },
      { status: 400 },
    );
  }

  if (signedTransaction.length > MAX_TRANSACTION_CHARS) {
    return NextResponse.json(
      { error: "That transaction is too large to be a swap." },
      { status: 400 },
    );
  }

  if (typeof quoteRef !== "string" || quoteRef.length === 0) {
    return NextResponse.json(
      { error: "No quote reference was supplied, so this cannot be submitted." },
      { status: 400 },
    );
  }

  const executed = await jupiterSwapExecute({ signedTransaction, quoteRef });

  if (!executed.ok || executed.data === undefined) {
    /* 502, not 500: the request was well formed and this server did its part.
       What failed is upstream or on-chain, and the operator's next step is to
       re-quote rather than to report a bug. */
    return NextResponse.json(
      { executed: false, error: executed.error?.message ?? "The swap did not land." },
      { status: 502 },
    );
  }

  return NextResponse.json({ executed: true, signature: executed.data.signature });
}
