import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import {
  getBlockHeight,
  getSignatureStatuses,
  resendTransaction,
} from "@/lib/solana/rpc";
import { activityStatus, describeChainError } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Watching a transfer `/api/transfer/submit` handed back as "pending".

   That happens when the transaction was broadcast but had not confirmed
   within that route's own short window — a serverless function has a
   timeout; a blockhash's ~60-90 second validity does not fit inside it. The
   operator's browser has no such limit, so it takes over here: called on an
   interval by TransferDialog, each call re-broadcasts the exact bytes the
   operator already signed (a harmless no-op if it already landed — Solana
   de-duplicates by signature) and reports what `getSignatureStatuses` says.

   `maxRetries: 0` on the ORIGINAL broadcast turned off the node's own
   automatic resending, on purpose, so that decision could be made here
   instead — on a schedule this app controls, stopping the moment a
   definitive answer arrives, rather than the node quietly retrying (or not)
   with no way for anyone to ask it what happened.

   ── When "pending" becomes an answer ───────────────────────────────────

   A signature the node has never seen is not, on its own, a failure: the
   transaction may still be in flight. It IS a failure once the chain has
   moved past the transaction's `lastValidBlockHeight`, because at that point
   no validator will accept those bytes again — the blockhash inside them has
   expired. When the client supplies that height (it comes back from
   `/api/transfer/build`), an unseen signature past it is reported as
   `expired`: definitive, nothing moved, safe to try again. Without it the
   client falls back to its own wall-clock give-up, which can only ever say
   "unknown".
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same ceiling as `/api/transfer/submit` — this is still a transfer. */
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

  const signature = typeof body.signature === "string" ? body.signature : "";
  const signedTransaction =
    typeof body.signedTransaction === "string" ? body.signedTransaction : "";
  const lastValidBlockHeight =
    typeof body.lastValidBlockHeight === "number" &&
    Number.isSafeInteger(body.lastValidBlockHeight) &&
    body.lastValidBlockHeight > 0
      ? body.lastValidBlockHeight
      : null;

  if (signature.length === 0) {
    return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  }

  if (signedTransaction.length > MAX_TRANSACTION_CHARS) {
    return NextResponse.json(
      { error: "That transaction is too large to be a transfer." },
      { status: 400 },
    );
  }

  /* Best-effort, and silently so. If it already landed this is a no-op; if
     the blockhash has since expired the node refuses it; either way, the
     status check below — not this — is what actually answers the question. */
  if (signedTransaction.length > 0) {
    await resendTransaction(signedTransaction).catch(() => {});
  }

  try {
    /* The height is read BEFORE the status, deliberately. A transaction can
       only land at a height at or below its `lastValidBlockHeight`, so a
       height already past it means any landing has already happened — and a
       status read after it will show that landing. The other order leaves a
       gap: a status read just before the transaction lands, then a height
       read just after the chain moves past its limit, and a transfer that
       went through is reported as expired, with "try again" beside it. */
    const height =
      lastValidBlockHeight === null ? null : await getBlockHeight().catch(() => null);

    const { value } = await getSignatureStatuses([signature]);
    const found = value[0] ?? null;

    if (found === null) {
      /* Unseen. Pending — unless the bytes can no longer land at all. */
      if (height !== null && lastValidBlockHeight !== null && height > lastValidBlockHeight) {
        return NextResponse.json(
          {
            status: "failed",
            signature,
            error:
              "The network never confirmed this transfer and the transaction has now expired. " +
              "Nothing was sent — try again.",
          },
          { status: 502 },
        );
      }
      return NextResponse.json({ status: "pending", signature });
    }

    const status = activityStatus(found.err, found.confirmationStatus);
    if (status === "failed") {
      return NextResponse.json(
        { status: "failed", signature, error: describeChainError(found.err) },
        { status: 502 },
      );
    }
    if (status === "pending") {
      return NextResponse.json({ status: "pending", signature });
    }
    return NextResponse.json({ status: "confirmed", signature });
  } catch {
    /* An RPC hiccup while checking is not the same as the transfer failing.
       Reported as still-pending, at 200, so the client's poll loop keeps
       trying rather than surfacing a scary error over a transient blip. */
    return NextResponse.json({ status: "pending", signature });
  }
}
