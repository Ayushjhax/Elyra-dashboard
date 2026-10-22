import { NextResponse } from "next/server";
import {
  databaseUnavailableMessage,
  getSessionUser,
  hasProfile,
} from "@/lib/auth/session";
import { proveSwap } from "@/lib/actions/proof";
import type { ActionsResponse } from "@/lib/actions/types";
import { isSolanaAddress } from "@/lib/solana/address";
import { listOpenActions, settleOpenAction } from "@/lib/actions/store";

/* ---------------------------------------------------------------------------
   Actions awaiting review, for the workspace.

   An action prepared in Telegram ("Review in Elyra") lands here: the chat
   can prepare and acknowledge one, but only a surface that can reach the
   person's wallet can finish it. GET lists the open ones; POST sets one
   aside, or records that the person signed it in their own wallet.

   Nothing here executes. A swap is finished by the swap dialog, which builds
   the transaction through Jupiter and has the browser wallet sign it; this
   route is told afterwards and keeps the record honest — the signature it
   is handed is checked on-chain, as a successful transaction this account's
   wallet signed, and stored with the row.

   A confirmation answers 200 when recorded, 404 when the action is no longer
   open, 422 when the signature does not prove the swap, and 503 when it
   could not be checked or written yet. Only the last is worth retrying.

   The user is the verified session's, never the body's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;
/** A Solana signature: 64 bytes, base58. */
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

async function session(
  request: Request,
): Promise<{ response: Response } | { userId: string; solanaAddress: string | null }> {
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
  return {
    userId: user.userId,
    solanaAddress:
      user.solanaAddress !== null && isSolanaAddress(user.solanaAddress) ? user.solanaAddress : null,
  };
}

const STATUS = { settled: 200, closed: 404, failed: 503 } as const;

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
    const settled = await settleOpenAction(id, resolved.userId, { outcome: "cancelled" });
    return NextResponse.json({ ok: settled === "settled" }, { status: STATUS[settled] });
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
    if (resolved.solanaAddress === null) {
      return NextResponse.json(
        { error: "This account's Solana wallet could not be resolved, so the swap can't be checked yet." },
        { status: 503 },
      );
    }
    const proof = await proveSwap(signature, resolved.solanaAddress);
    if (proof.outcome !== "proven") {
      return NextResponse.json(
        { error: proof.reason },
        { status: proof.outcome === "rejected" ? 422 : 503 },
      );
    }
    const settled = await settleOpenAction(id, resolved.userId, { outcome: "confirmed", signature });
    return NextResponse.json({ ok: settled === "settled" }, { status: STATUS[settled] });
  }

  return NextResponse.json({ error: "op must be dismiss or confirm." }, { status: 400 });
}
