import { NextResponse } from "next/server";
import { isActionKind, prepareAction, type ActionProposal } from "@/lib/personalized/actions";
import { buildContext } from "@/lib/personalized/context";
import { resolve } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   The confirmation boundary.

   This is the only endpoint that could ever move money, and today it moves
   none. It re-validates against a fresh snapshot and then reports that no
   executor exists — see the note in lib/personalized/actions.ts for what is
   missing and why it was not built here.

   The shape is the point. When an executor lands, it is called from exactly
   one place: below the re-validation, after `readiness === "ready"`, and only
   on a request the operator made by pressing Confirm. A model response can
   never reach this code path, because the model does not talk to this route.
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

  /* The only gate. Nothing below this line exists yet. */
  if (action.readiness !== "ready") {
    return NextResponse.json({
      executed: false,
      action,
      error: action.reason,
    });
  }

  /* Unreachable today: no `prepareAction` path returns "ready" because no
     executor is wired up. Left as the explicit seam so the hand-off is one
     call in one place when it is. */
  return NextResponse.json({
    executed: false,
    action,
    error: "No executor is connected for this action.",
  });
}
