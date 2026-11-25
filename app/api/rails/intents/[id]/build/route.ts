import { NextResponse } from "next/server";
import { railsUser } from "@/lib/rails/console";
import { buildPayment } from "@/lib/rails/intents";

/* ---------------------------------------------------------------------------
   The unsigned USDC transfer for an approved payment intent.

   Built from the intent as it was recorded — the payee, the amount and the
   Solana Pay reference are the intent's, and the browser sends none of
   them — from the session's own wallet. The browser signs it and sends it
   through /api/transfer/submit like any other transfer, then confirms the
   intent with the signature.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  if (user.solanaAddress === null) {
    return NextResponse.json({ error: "This account has no Solana wallet to pay from." }, { status: 400 });
  }
  const { id } = await context.params;
  const built = await buildPayment(user.userId, id, user.solanaAddress);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
  return NextResponse.json({ ...built.value, signer: user.solanaAddress });
}
