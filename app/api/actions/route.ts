import { NextResponse } from "next/server";
import {
  databaseUnavailableMessage,
  getSessionUser,
  hasProfile,
} from "@/lib/auth/session";
import type { PreparedAction } from "@/lib/personalized/types";
import {
  listOpenActions,
  settleOpenAction,
  type PreparedActionStatus,
} from "@/lib/telegram/actions";

/* ---------------------------------------------------------------------------
   Actions awaiting review, for the workspace.

   An action prepared in Telegram ("Review in Elyra") lands here: the chat
   can prepare and acknowledge one, but only a surface that can reach the
   person's wallet can finish it. GET lists the open ones; POST sets one
   aside, or records that the person signed it in their own wallet.

   Nothing here executes. A swap is finished by the swap dialog, which builds
   the transaction through Jupiter and has the browser wallet sign it; this
   route is told afterwards and keeps the record honest.

   The user is the verified session's, never the body's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface OpenAction {
  id: string;
  action: PreparedAction;
  surface: "web" | "telegram";
  status: PreparedActionStatus;
  expiresAt: string;
}

export interface ActionsResponse {
  actions: OpenAction[];
  error: string | null;
}

const ID = /^[0-9a-f-]{36}$/i;
/** A Solana signature: 64 bytes, base58. */
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

async function session(
  request: Request,
): Promise<{ response: Response } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null) {
    return { response: NextResponse.json({ actions: [], error: "Not signed in" }, { status: 401 }) };
  }
  if (!hasProfile(user)) {
    return {
      response: NextResponse.json<ActionsResponse>(
        { actions: [], error: databaseUnavailableMessage("Actions awaiting review") },
        { status: 503 },
      ),
    };
  }
  return { userId: user.userId };
}

export async function GET(request: Request): Promise<Response> {
  const resolved = await session(request);
  if ("response" in resolved) return resolved.response;

  const records = await listOpenActions(resolved.userId);
  return NextResponse.json<ActionsResponse>({
    actions: records.map((record) => ({
      id: record.id,
      action: record.action,
      surface: record.surface,
      status: record.status,
      expiresAt: record.expiresAt,
    })),
    error: null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await session(request);
  if ("response" in resolved) return resolved.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!ID.test(id)) {
    return NextResponse.json({ error: "Which action? Pass its id." }, { status: 400 });
  }

  if (body.op === "dismiss") {
    const settled = await settleOpenAction(id, resolved.userId, "cancelled");
    return NextResponse.json({ ok: settled }, { status: settled ? 200 : 404 });
  }

  if (body.op === "confirm") {
    /* Confirmed means a wallet signed it. The signature is the evidence, so a
       confirmation without one is refused rather than recorded. */
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!SIGNATURE.test(signature)) {
      return NextResponse.json(
        { error: "A confirmation needs the transaction signature from your wallet." },
        { status: 400 },
      );
    }
    const settled = await settleOpenAction(id, resolved.userId, "confirmed");
    return NextResponse.json({ ok: settled }, { status: settled ? 200 : 404 });
  }

  return NextResponse.json({ error: "op must be dismiss or confirm." }, { status: 400 });
}
