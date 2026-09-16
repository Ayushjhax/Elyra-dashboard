import { NextResponse } from "next/server";
import { isActionKind, prepareAction, type ActionProposal } from "@/lib/personalized/actions";
import { buildContext } from "@/lib/personalized/context";
import { resolve } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   The confirmation boundary.

   This route re-validates a proposal against a fresh snapshot and reports
   what could be done with it. It does not execute, and for a swap it cannot:
   signing happens in the operator's browser, so no server route can complete
   one on its own. A `ready` swap is finished through /api/swap/build and
   /api/swap/submit, which is where the signature enters the flow.

   That is a property worth keeping rather than a gap to close. A model
   response can never reach an executor here, because there is no executor
   here — the only thing that can move funds needs a signature this server
   cannot produce.
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

  if (!isActionKind(body.kind)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const built = await buildContext({
    userId: session.userId,
    solanaAddress: session.solanaAddress,
    sessionWallet: session.sessionWallet,
  });

  if (built.snapshot === null) {
    return NextResponse.json(
      { error: "Your account state could not be read, so nothing was confirmed." },
      { status: 503 },
    );
  }

  const proposal: ActionProposal = {
    kind: body.kind,
    symbol: typeof body.symbol === "string" ? body.symbol : undefined,
    toSymbol: typeof body.toSymbol === "string" ? body.toSymbol : undefined,
    fraction: typeof body.fraction === "number" ? body.fraction : undefined,
    quantity: typeof body.quantity === "number" ? body.quantity : undefined,
    market: typeof body.market === "string" ? body.market : undefined,
    orderId: typeof body.orderId === "string" ? body.orderId : undefined,
  };

  const limit = built.context.memories.find(
    (memory) => memory.type === "concentration_limit",
  );

  /* Re-derived, not trusted. A preview built ninety seconds ago describes a
     balance that may since have been spent. */
  const action = prepareAction(proposal, built.snapshot, {
    concentrationLimit: typeof limit?.value === "number" ? limit.value : null,
  });

  if (action.readiness === "rejected") {
    return NextResponse.json(
      {
        executed: false,
        action,
        error: `This changed before it could be confirmed. ${action.reason ?? ""}`.trim(),
      },
      { status: 409 },
    );
  }

  if (action.readiness !== "ready") {
    return NextResponse.json({
      executed: false,
      action,
      error: action.reason,
    });
  }

  /* Ready, and still not executed here. The signature has to come from the
     operator's wallet, so this reports what is executable and points at the
     surface that can finish it rather than pretending to have done it. */
  return NextResponse.json({
    executed: false,
    action,
    signingRequired: true,
    error:
      "This is ready, but it has to be signed in your browser. Open the Swap " +
      "dialog in Elyra to confirm it.",
  });
}
