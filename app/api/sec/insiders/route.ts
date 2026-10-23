import { NextResponse, type NextRequest } from "next/server";
import { companyInsiders, type CompanyInsiders } from "@/lib/research/sec/alpha";
import { secConfigured } from "@/lib/research/sec/client";

/* GET /api/sec/insiders?q=NVDA — what a company's insiders bought and sold,
   read from its most recent Form 4s. `pending` says how many are still
   being read; the client asks again until it is zero. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QUERY = /^[A-Za-z0-9 .&'-]{1,60}$/;

export async function GET(request: NextRequest): Promise<NextResponse<{ insiders: CompanyInsiders | null; error: string | null }>> {
  if (!secConfigured()) return NextResponse.json({ insiders: null, error: "SEC_USER_AGENT is not set, so EDGAR cannot be read." });
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!QUERY.test(query)) return NextResponse.json({ insiders: null, error: "Name a company." }, { status: 400 });
  const insiders = await companyInsiders(query, 4_000);
  return NextResponse.json(
    { insiders, error: insiders === null ? `EDGAR has no registrant matching "${query}".` : null },
    { status: insiders === null ? 404 : 200, headers: { "cache-control": "no-store" } },
  );
}
