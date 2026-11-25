import { NextResponse } from "next/server";
import { railsUser } from "@/lib/rails/console";
import { createRequest } from "@/lib/rails/requests";

/* ---------------------------------------------------------------------------
   A payment request the person makes for themselves: USDC on Solana to
   their own wallet, settled from the chain (lib/rails/requests.ts).
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  if (user.solanaAddress === null) {
    return NextResponse.json({ error: "This account has no Solana wallet to be paid into." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const created = await createRequest({
    userId: user.userId,
    keyId: null,
    recipient: user.solanaAddress,
    amount: body.amount,
    label: body.label,
    memo: body.memo,
    expiresInMinutes: body.expiresInMinutes,
    actor: "person",
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
  return NextResponse.json({ request: created.request }, { status: 201 });
}
