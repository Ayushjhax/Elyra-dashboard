import { NextResponse } from "next/server";
import { fundStatement, fundsUser } from "@/lib/funds/console";

/* ---------------------------------------------------------------------------
   A fund's statement as CSV: every hourly mark (NAV and NAV per unit),
   every capital flow at its unit price, and every closed trade's result.
   The ledger export (/api/rails/ledger?format=csv) is its sealed record.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const csv = await fundStatement(user.userId, id);
  if (csv === null) return NextResponse.json({ error: "No such fund." }, { status: 404 });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="elyra-fund-statement-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
