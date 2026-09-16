import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import { sendTransaction } from "@/lib/solana/rpc";

/* ---------------------------------------------------------------------------
   Step two of a transfer: broadcast what the operator signed.

   As with a swap, the safety property is that this cannot act alone. The
   bytes arriving here are already signed by a key this server has never
   seen, and without that signature they are inert. They are forwarded
   verbatim — never decoded, never rebuilt — so what the operator approved in
   their wallet is exactly what reaches the chain.

   Not retried at any level. `sendTransaction` sets `maxRetries: 0` on the
   node for the same reason this route makes one attempt: a resend is a
   second attempt at moving money, and a transfer has no slippage check that
   would make the duplicate fail safely.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A transfer is small; anything larger is not one. */
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

  if (typeof signedTransaction !== "string" || signedTransaction.length === 0) {
    return NextResponse.json(
      { error: "No signed transaction was supplied." },
      { status: 400 },
    );
  }

  if (signedTransaction.length > MAX_TRANSACTION_CHARS) {
    return NextResponse.json(
      { error: "That transaction is too large to be a transfer." },
      { status: 400 },
    );
  }

  try {
    const signature = await sendTransaction(signedTransaction);
    return NextResponse.json({ executed: true, signature });
  } catch (error: unknown) {
    /* The node rejects a transaction that fails simulation, which is the
       common and useful case: insufficient funds, a missing account, an
       expired blockhash. Its message names which, so it is passed through
       rather than flattened into "the transfer failed". */
    return NextResponse.json(
      {
        executed: false,
        error:
          error instanceof Error ? error.message : "The transfer was not accepted.",
      },
      { status: 502 },
    );
  }
}
