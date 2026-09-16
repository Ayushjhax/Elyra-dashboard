import { NextResponse } from "next/server";
import {
  deleteConversation,
  getConversation,
  listMessages,
} from "@/lib/personalized/conversations";
import { resolve, resolveWritable } from "@/lib/personalized/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* `getConversation` filters by the verified user id, so an id belonging to
   another account resolves to null and answers 404 — it never returns that
   account's transcript. The messages read is scoped the same way
   independently, so neither call can leak on its own. */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;

  const { userId } = resolved.session;
  const { id } = await params;
  if (userId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = await getConversation(userId, id);
  if (conversation === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    conversation,
    messages: await listMessages(userId, id),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveWritable(request, "Deleting a conversation");
  if ("response" in resolved) return resolved.response;

  const { id } = await params;
  const removed = await deleteConversation(resolved.session.userId, id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
