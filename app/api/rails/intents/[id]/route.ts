import { NextResponse } from "next/server";
import { railsUser } from "@/lib/rails/console";
import { approveIntent, confirmIntent, declineIntent } from "@/lib/rails/intents";

/* ---------------------------------------------------------------------------
   The person's answer to an agent's request.

     { op: "approve" }               a perp order runs now; a swap or a
                                     payment opens its signing step
     { op: "decline" }               no
     { op: "confirm", signature }    the wallet signed it; proven against
                                     the chain before it is recorded

   The user is the verified session's; an intent is found only among theirs.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const outcome =
    body.op === "approve"
      ? await approveIntent(user.userId, id)
      : body.op === "decline"
        ? await declineIntent(user.userId, id)
        : body.op === "confirm"
          ? user.solanaAddress === null
            ? { ok: false as const, error: "This account's Solana wallet could not be resolved, so the transaction can't be checked yet.", status: 503 }
            : await confirmIntent(user.userId, id, typeof body.signature === "string" ? body.signature : "", user.solanaAddress)
          : { ok: false as const, error: "op must be approve, decline or confirm.", status: 400 };

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ intent: outcome.value });
}
