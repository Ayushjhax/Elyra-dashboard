import { NextResponse } from "next/server";
import { isActionKind, prepareAction, type ActionProposal } from "@/lib/personalized/actions";
import { buildContext } from "@/lib/personalized/context";
import { resolve } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   Re-prepare an action against live state.

   Called when the operator opens a preview that was produced earlier in the
   conversation. The gap between "Elyra suggested this" and "the operator
   looked at it" is where balances move, so nothing is taken from the earlier
   preview: the proposal is re-resolved from scratch here.
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
      { error: "Your account state could not be read, so nothing can be prepared." },
      { status: 503 },
    );
  }

  /* Every field below is a HINT. `prepareAction` re-derives the amount from
     the live balance and ignores anything it cannot verify. */
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

  return NextResponse.json({
    action: prepareAction(proposal, built.snapshot, {
      concentrationLimit: typeof limit?.value === "number" ? limit.value : null,
    }),
  });
}
