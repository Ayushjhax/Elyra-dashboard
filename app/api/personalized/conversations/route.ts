import { NextResponse } from "next/server";
import {
  createConversation,
  deriveTitle,
  listConversations,
} from "@/lib/personalized/conversations";
import { resolve, resolveWritable } from "@/lib/personalized/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;

  const { userId } = resolved.session;
  if (userId === null) return NextResponse.json({ conversations: [] });

  return NextResponse.json({ conversations: await listConversations(userId) });
}

export async function POST(request: Request) {
  const resolved = await resolveWritable(request, "Starting a conversation");
  if ("response" in resolved) return resolved.response;

  let body: { title?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? deriveTitle(body.title)
      : "New conversation";

  const conversation = await createConversation(resolved.session.userId, title);
  if (conversation === null) {
    return NextResponse.json(
      { error: "Conversations are not available yet." },
      { status: 503 },
    );
  }
  return NextResponse.json({ conversation });
}
