import { NextResponse, type NextRequest } from "next/server";
import { secConfigured } from "@/lib/research/sec/client";
import { companyProfile, type CompanyProfile } from "@/lib/research/sec/company";

/* ---------------------------------------------------------------------------
   GET /api/sec/company?q=NVDA

   One registrant — by ticker, CIK or name — with its SEC record, its latest
   reported quarter and its recent filings. Any company that files with the
   SEC, listed on a US exchange or not.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CompanyResponse {
  company: CompanyProfile | null;
  error: string | null;
}

const QUERY = /^[A-Za-z0-9 .&'-]{1,60}$/;

export async function GET(request: NextRequest): Promise<NextResponse<CompanyResponse>> {
  if (!secConfigured()) {
    return NextResponse.json({ company: null, error: "SEC_USER_AGENT is not set, so EDGAR cannot be read." });
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!QUERY.test(query)) {
    return NextResponse.json({ company: null, error: "Name a company by ticker, name or CIK." }, { status: 400 });
  }
  const company = await companyProfile(query);
  return NextResponse.json(
    { company, error: company === null ? `EDGAR has no registrant matching "${query}".` : null },
    { status: company === null ? 404 : 200, headers: { "cache-control": "public, max-age=300, stale-while-revalidate=900" } },
  );
}
