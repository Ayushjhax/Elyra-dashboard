import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/personalized/session";
import { readRequest } from "@/lib/rails/requests";
import { toRequest } from "@/lib/rails/store";

/* ---------------------------------------------------------------------------
   A payment request's public view, for its pay page and anyone holding the
   link: what is asked, to which wallet, and whether the chain shows it paid.

   Public by design — a payer needs no Elyra account — so it carries only
   what a payer needs: no account, no user id, no agent key. The status is
   read from the chain, at most every ten seconds per request
   (lib/rails/requests.ts), and callers are rate-limited by address.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_MINUTE = 60;

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No such payment request." }, { status: 404 });
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`pay:${caller}`, PER_MINUTE)) {
    return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429, headers: { "retry-after": "30" } });
  }
  const row = await readRequest(id).catch(() => null);
  if (row === null) return NextResponse.json({ error: "No such payment request." }, { status: 404 });
  const view = toRequest(row, null);
  return NextResponse.json(
    {
      request: {
        id: view.id,
        label: view.label,
        memo: view.memo,
        recipient: view.recipient,
        mint: view.mint,
        amount: view.amount,
        status: view.status,
        solanaPayUrl: view.solanaPayUrl,
        paidSignature: view.paidSignature,
        paidAt: view.paidAt,
        expiresAt: view.expiresAt,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
