import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { LIBRARY } from "@/lib/strategies/library";
import { listSaved, saveDesign } from "@/lib/strategies/server";
import { jsonBody, strategiesUser } from "@/lib/strategies/session";
import { validateDesign } from "@/lib/strategies/spec";
import type { DesignResult, DesignSource } from "@/lib/strategies/types";

/* ---------------------------------------------------------------------------
   Strategies.

     GET   Elyra's library (to anyone), and the person's saved designs
           (signed in)
     POST  { design, source, result? } — save a design, checked by
           `validateDesign` first, whoever wrote it
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: readonly DesignSource[] = ["designer", "library", "ai"];

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  const saved = user === null || user.userId === null ? { saved: [], error: null } : await listSaved(user.userId);
  return NextResponse.json({ library: LIBRARY, saved: saved.saved, error: saved.error }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const user = await strategiesUser(request);
  if ("response" in user) return user.response;
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const checked = validateDesign(body.design);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const source = SOURCES.includes(body.source as DesignSource) ? (body.source as DesignSource) : "designer";
  /* A stored result is display only; it is replaced by the next test. */
  const result = typeof body.result === "object" && body.result !== null ? (body.result as DesignResult) : null;
  const saved = await saveDesign(user.userId, { design: checked.design, source, result });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ saved: saved.saved }, { status: 201 });
}
