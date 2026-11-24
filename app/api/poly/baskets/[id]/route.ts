import { NextResponse } from "next/server";
import { deleteBasket } from "@/lib/poly/baskets";
import { NO_STORE, scoutUser } from "@/lib/scout/session";

/* One paper basket: DELETE. Only the owner's. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const done = await deleteBasket(user.userId, id);
  return done ? NextResponse.json({ id }, { headers: NO_STORE }) : NextResponse.json({ error: "No such basket." }, { status: 404 });
}
