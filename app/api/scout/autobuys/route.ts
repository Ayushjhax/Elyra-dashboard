import { NextResponse } from "next/server";
import { validateRule } from "@/lib/scout/autobuy";
import { createAutoBuy, listAutoBuys } from "@/lib/scout/autobuys";
import { jsonBody, NO_STORE, scoutUser } from "@/lib/scout/session";

/* ---------------------------------------------------------------------------
   Auto-buy rules (lib/scout/autobuy.ts). Run by the five-minute tick
   (lib/scout/engine.ts) through the chart ticket's own order path.

     GET   the person's rules and what they fired
     POST  a rule, checked by `validateRule`; live only when the server is
           switched to live and the person's trading key is approved
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  return NextResponse.json(await listAutoBuys(user.userId), { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const checked = validateRule(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const created = await createAutoBuy(user.userId, checked.rule);
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
  return NextResponse.json({ id: created.id }, { status: 201, headers: NO_STORE });
}
