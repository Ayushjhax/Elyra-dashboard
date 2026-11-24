import { NextResponse } from "next/server";
import { validateBasket } from "@/lib/poly/basketMath";
import { createBasket, listBaskets } from "@/lib/poly/baskets";
import { jsonBody, NO_STORE, scoutUser } from "@/lib/scout/session";

/* ---------------------------------------------------------------------------
   Poly baskets (lib/poly/baskets.ts): paper baskets of Polymarket outcomes.
   Elyra places no Polymarket orders.

     GET   the person's baskets, valued from the books now, settled legs at
           their payout
     POST  { name, stakeUsd, legs } — each leg bought on paper at the book
           walked for its share of the stake
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  return NextResponse.json(await listBaskets(user.userId), { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const checked = validateBasket(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const created = await createBasket(user.userId, checked.basket);
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
  return NextResponse.json({ id: created.id }, { status: 201, headers: NO_STORE });
}
