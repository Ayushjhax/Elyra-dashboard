import { NextResponse } from "next/server";
import { railsUser } from "@/lib/rails/console";
import { ledgerCsv, verifyChain } from "@/lib/rails/ledger";
import { MIGRATION, readLedger } from "@/lib/rails/store";

/* ---------------------------------------------------------------------------
   The person's whole agent ledger: every mandate granted, every intent an
   agent sent and what became of it, every payment settled — in order, with
   each event's hash and the hash it follows.

     GET                  JSON, with the chain verified
     GET ?format=csv      a CSV download anyone can re-verify with SHA-256
                          (lib/rails/ledger.ts says how)
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const events = await readLedger(user.userId);
  if (events === null) return NextResponse.json({ error: MIGRATION }, { status: 503 });

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new Response(ledgerCsv(events), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="elyra-agent-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json({ events, verification: verifyChain(events) }, { headers: { "cache-control": "no-store" } });
}
