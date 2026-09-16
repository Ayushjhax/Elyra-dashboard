import { NextResponse } from "next/server";
import { UsageLimitError, ensureConversation, runAgent } from "@/lib/agent";
import { getSessionUser, hasProfile, profileUnavailable } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   The web surface.

   It authenticates, resolves a conversation, and calls runAgent. It holds no
   prompt text, no tool definitions and no provider logic — all of that lives
   in lib/agent and is shared with Telegram.

   The request body carries a message and nothing else that matters. `userId`
   comes from the verified Privy token; a userId in the body is ignored, and
   there is no code path that would read one.
--------------------------------------------------------------------------- */

/* node:crypto and the exchange signing path need the Node runtime. */
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4_000;

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /* Chat is stored: every turn is written to `messages` and read back as
     history, and the run counter that caps usage lives in the same database.
     Without a row there is nowhere to put any of it, and answering anyway
     would produce a conversation that forgets itself between requests. */
  if (!hasProfile(user)) return profileUnavailable("Agent chat");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message ?? "")
      : "";

  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is longer than ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 },
    );
  }

  try {
    const conversationId = await ensureConversation({
      userId: user.userId,
      surface: "web",
    });

    const { reply, runId } = await runAgent({
      userId: user.userId,
      conversationId,
      message: trimmed,
      surface: "web",
      sessionWallet: user.walletAddress,
    });

    return NextResponse.json({ reply, runId, conversationId });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    /* The real error goes to the server log; the client gets a sentence. An
       upstream message can carry a key fragment or an internal hostname. */
    console.error("[agent/chat]", error);
    return NextResponse.json(
      { error: "The agent could not complete that request." },
      { status: 500 },
    );
  }
}
