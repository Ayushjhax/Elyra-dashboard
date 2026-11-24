import { NextResponse } from "next/server";
import { deleteAutoBuy, setAutoBuyStatus } from "@/lib/scout/autobuys";
import { jsonBody, NO_STORE, scoutUser } from "@/lib/scout/session";

/* One auto-buy rule: PATCH { status: "active" | "paused" }, DELETE. Only the owner's. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = await jsonBody(request);
  const status = body?.status;
  if (status !== "active" && status !== "paused") return NextResponse.json({ error: "Status is active or paused." }, { status: 400 });
  const done = await setAutoBuyStatus(user.userId, id, status);
  return done ? NextResponse.json({ id, status }, { headers: NO_STORE }) : NextResponse.json({ error: "No such rule." }, { status: 404 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const done = await deleteAutoBuy(user.userId, id);
  return done ? NextResponse.json({ id }, { headers: NO_STORE }) : NextResponse.json({ error: "No such rule." }, { status: 404 });
}
