import { NextResponse } from "next/server";
import { fundDetail, fundsUser } from "@/lib/funds/console";
import { fundAction, moveCapital, setManager, updateCharter } from "@/lib/funds/owner";

/* ---------------------------------------------------------------------------
   One fund.

     GET    the fund in full, marked to market now
     PATCH  change its charter (any of the charter's fields)
     POST   { op: "pause" | "resume" | "wind_down" }
            { op: "graduate", capitalUsd }          paper → live
            { op: "capital", direction: "add" | "withdraw", amountUsd }
            { op: "manager", keyId | null }

   Every change is the person's, from the verified session, and is written
   to their ledger (lib/funds/owner.ts).
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return body !== null && typeof body === "object" && !Array.isArray(body) ? body : null;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const detail = await fundDetail(user.userId, id);
  if (detail === null) return NextResponse.json({ error: "No such fund." }, { status: 404 });
  return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = await bodyOf(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const saved = await updateCharter(user.userId, id, body);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = await bodyOf(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });

  if (body.op === "capital") {
    const moved = await moveCapital(user.userId, id, body);
    return moved.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: moved.error }, { status: moved.status });
  }
  if (body.op === "manager") {
    const changed = await setManager(user.userId, id, body.keyId ?? null);
    return changed.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: changed.error }, { status: changed.status });
  }
  const acted = await fundAction(user.userId, id, body.op, body);
  if (!acted.ok) return NextResponse.json({ error: acted.error }, { status: acted.status });
  return NextResponse.json({ ok: true, notes: acted.value.notes, successorId: acted.value.successor?.id ?? null });
}
