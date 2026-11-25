import { NextResponse } from "next/server";
import { deleteDesign, updateDesign } from "@/lib/strategies/server";
import { jsonBody, strategiesUser } from "@/lib/strategies/session";
import { validateDesign } from "@/lib/strategies/spec";
import type { DesignResult } from "@/lib/strategies/types";

/* One saved strategy: PATCH { design, result? } replaces it; DELETE removes it. The person's own only. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const user = await strategiesUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const checked = validateDesign(body.design);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = typeof body.result === "object" && body.result !== null ? (body.result as DesignResult) : null;
  const saved = await updateDesign(user.userId, id, { design: checked.design, result });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ saved: saved.saved });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const user = await strategiesUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  if (!(await deleteDesign(user.userId, id))) return NextResponse.json({ error: "No such strategy." }, { status: 404 });
  return new Response(null, { status: 204 });
}
