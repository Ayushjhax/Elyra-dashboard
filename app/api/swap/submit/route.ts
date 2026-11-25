import { NextResponse } from "next/server";
import { jupiterSwapExecute } from "@/lib/providers/jupiter";
import { sunriseExecute } from "@/lib/providers/sunrise";
import { resolve } from "@/lib/personalized/session";
import { decodeRef, isOrderRoute, isStockRef, isSunriseRef, unmarkStockRef } from "@/lib/sunrise/api";
import { eligibility, requestCountry } from "@/lib/sunrise/eligibility";

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

   A quote Sunrise built (a `sunrise:` quoteRef, lib/sunrise/api.ts) goes to
   Sunrise's /v1/execute instead, with the quote's id and route, which it
   holds the signed bytes to. The request's country is checked again first
   (lib/sunrise/eligibility.ts). An outcome Sunrise cannot report is never
   turned into "sign again": the same bytes are resent once by the client
   in lib/providers/sunrise.ts, and past that the person is told to check
   their wallet, since the trade may have gone through.

   A stock token Jupiter quoted (a `backpack:` quoteRef, a deployment without
   Sunrise's key) meets the same country and confirmation check, then goes to
   Jupiter with Jupiter's own ref, unmarked.
--------------------------------------------------------------------------- */

/** Sunrise accepts a signed transaction of at most this many base64 characters. */
const SUNRISE_MAX_CHARS = 5_464;

const STATUS_FOR = { refuse: 403, requote: 409, wait: 429, resend: 502, fail: 502 } as const;

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

  if (isSunriseRef(quoteRef)) {
    const ref = decodeRef(quoteRef);
    if (ref === null) return NextResponse.json({ error: "That quote reference could not be read; quote again." }, { status: 400 });
    if (signedTransaction.length > SUNRISE_MAX_CHARS) {
      return NextResponse.json({ error: "That transaction is too large for Sunrise to accept." }, { status: 400 });
    }
    const allowed = eligibility(requestCountry(request.headers), body.confirmEligible === true);
    if (!allowed.ok) return NextResponse.json({ executed: false, error: allowed.reason, eligibility: allowed.code }, { status: 403 });

    const result = await sunriseExecute({ signedTransaction, ...ref });
    if (!result.ok) {
      const { failure } = result;
      const error =
        failure.action === "resend"
          ? "Sunrise could not confirm whether this trade went through. Check your wallet before trying again — do not sign it again."
          : failure.message;
      return NextResponse.json(
        { executed: false, error, code: failure.code, ...(failure.txHash === null ? {} : { txHash: failure.txHash }) },
        { status: STATUS_FOR[failure.action], ...(failure.retryAfterSec === null ? {} : { headers: { "retry-after": String(failure.retryAfterSec) } }) },
      );
    }
    const order = result.data.orders[0] ?? null;
    return NextResponse.json({
      executed: true,
      signature: result.data.txHash,
      confirmed: result.data.status === "CONFIRMED",
      /* An RFQ route places an order a market maker fills later; the dialog follows it through /api/swap/orders. */
      order: isOrderRoute(ref.routeName) ? { status: order?.status ?? "PENDING" } : null,
    });
  }

  let jupiterRef = quoteRef;
  if (isStockRef(quoteRef)) {
    const inner = unmarkStockRef(quoteRef);
    if (inner === null) return NextResponse.json({ error: "That quote reference could not be read; quote again." }, { status: 400 });
    const allowed = eligibility(requestCountry(request.headers), body.confirmEligible === true);
    if (!allowed.ok) return NextResponse.json({ executed: false, error: allowed.reason, eligibility: allowed.code }, { status: 403 });
    jupiterRef = inner;
  }

  const executed = await jupiterSwapExecute({ signedTransaction, quoteRef: jupiterRef });

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
