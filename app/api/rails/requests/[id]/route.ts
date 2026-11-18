import { NextResponse } from "next/server";
import { railsUser } from "@/lib/rails/console";
import { cancelRequest } from "@/lib/rails/requests";

/* Cancels an open payment request. A payment already on its way still lands; it is simply no longer asked for. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No such request." }, { status: 404 });
  const cancelled = await cancelRequest(user.userId, id);
  return cancelled ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "No open request with that id." }, { status: 404 });
}
