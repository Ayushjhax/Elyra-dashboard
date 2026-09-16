import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  summariseUnlocks,
  unlocksConfigured,
  upcomingUnlocks,
  UNLOCKS_UNAVAILABLE,
} from "@/lib/research/unlocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  /* Availability is part of the payload, not an error status. The UI needs to
     render an explanation, and a 503 would read as an outage rather than as
     an unconfigured optional capability. */
  if (!unlocksConfigured()) {
    return NextResponse.json(
      { configured: false, reason: UNLOCKS_UNAVAILABLE, unlocks: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const params = new URL(request.url).searchParams;
  const hours = Number(params.get("hours") ?? 168);
  const result = await upcomingUnlocks(
    Number.isFinite(hours) ? hours : 168,
    params.get("token"),
  );

  return NextResponse.json(
    {
      configured: true,
      unlocks: result.data ?? [],
      summary: summariseUnlocks(result.data ?? []),
      error: result.ok ? null : result.error?.message,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
