import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { capabilities } from "@/lib/research/capabilities";

/* ---------------------------------------------------------------------------
   What Research can currently do.

   Authenticated: the reasons name which environment variables are unset,
   which is operational detail and not something an anonymous caller needs.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json(
    { capabilities: capabilities() },
    { headers: { "cache-control": "no-store" } },
  );
}
