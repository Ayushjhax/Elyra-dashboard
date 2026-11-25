import { NextResponse } from "next/server";
import { railsUser, saveMandate } from "@/lib/rails/console";

/* ---------------------------------------------------------------------------
   Grants a mandate to one of the person's agent keys, replacing any it had.
   Checked by `validateMandate` (lib/rails/policy.ts) and written to the
   ledger as granted.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const saved = await saveMandate(user.userId, body);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ mandate: saved.mandate }, { status: 201 });
}
