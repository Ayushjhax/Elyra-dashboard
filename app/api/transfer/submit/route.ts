import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import { getSignatureStatuses, sendTransaction } from "@/lib/solana/rpc";
import { activityStatus, describeChainError } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Step two of a transfer: broadcast what the operator signed, and stay long
   enough to find out whether it actually landed.

   The bytes arriving here are already signed by a key this server has never
   seen, and without that signature they are inert. They are forwarded
   verbatim — never decoded, never rebuilt — so what the operator approved in
   their wallet is exactly what reaches the chain.

   ── The bug this route used to have ────────────────────────────────────

   It used to return `{executed: true, signature}` the instant `sendTransaction`
   handed back a signature, and the dialog showed "Transfer sent." A signature
   from `sendTransaction` means the RPC node accepted the transaction and
   forwarded it ONCE — `maxRetries: 0` on that call turns off the node's own
   automatic resending, deliberately, so this app could decide whether to
   retry instead of the node silently doing so. Nothing then decided. A
   broadcast that missed its leader — an ordinary, not-rare event on a
   congested network — simply never landed, while the operator had already
   been told it was done. That is "I approved it but the SOL never arrived":
   not a lie exactly, but a claim made before it was true, about money that
   cannot be recalled once believed.

   Now: after the one broadcast, this route watches for up to
   `SERVER_POLL_BUDGET_MS` — comfortably inside a serverless function's
   timeout — and only reports success once `getSignatureStatuses` actually
   confirms it. Still unresolved after that window returns `pending`, and
   `/api/transfer/status` is where the operator's own browser — which has no
   such timeout — picks up watching, re-broadcasting on each check to give a
   dropped attempt another chance to land before the blockhash expires.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A transfer is small; anything larger is not one. */
const MAX_TRANSACTION_CHARS = 8_192;

/* How long THIS request stays open trying to confirm, before handing the
   rest of the wait to the client. A mainnet send at `confirmed` commitment
   typically lands in one to a few seconds under healthy conditions, so this
   comfortably covers the common case without risking a serverless timeout —
   it does not need to cover the worst case, only to avoid claiming success
   before it is true. */
const SERVER_POLL_BUDGET_MS = 8_000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

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

  let signature: string;
  try {
    signature = await sendTransaction(signedTransaction);
  } catch (error: unknown) {
    /* The node rejects a transaction that fails SIMULATION here, before
       anything is broadcast — insufficient funds, a missing account, an
       expired blockhash. Its message names which, so it is passed through
       rather than flattened into "the transfer failed". */
    return NextResponse.json(
      {
        status: "failed",
        error:
          error instanceof Error ? error.message : "The transfer was not accepted.",
      },
      { status: 502 },
    );
  }

  /* Broadcast succeeded; now find out whether it actually landed, rather
     than reporting the broadcast itself as the outcome. */
  const deadline = Date.now() + SERVER_POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const outcome = await getSignatureStatuses([signature]).catch(() => null);
    const found = outcome?.value[0] ?? null;
    if (found === null) continue;

    const status = activityStatus(found.err, found.confirmationStatus);
    if (status === "confirmed") {
      return NextResponse.json({ status: "confirmed", signature });
    }
    if (status === "failed") {
      return NextResponse.json(
        { status: "failed", signature, error: describeChainError(found.err) },
        { status: 502 },
      );
    }
    /* "pending" — keep polling within the budget. */
  }

  /* Broadcast, but not yet confirmed. NOT a failure — the transaction may
     still land — and NOT a success either, which is the mistake this route
     used to make. The client keeps watching from here. */
  return NextResponse.json({ status: "pending", signature }, { status: 202 });
}
