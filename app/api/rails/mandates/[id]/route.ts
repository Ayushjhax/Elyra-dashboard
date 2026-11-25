import { NextResponse } from "next/server";
import { railsUser, revokeMandate } from "@/lib/rails/console";

/* Revokes a mandate. The key still reads; it can no longer ask for anything. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No such mandate." }, { status: 404 });
  const revoked = await revokeMandate(user.userId, id);
  return revoked ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "No such mandate." }, { status: 404 });
}
