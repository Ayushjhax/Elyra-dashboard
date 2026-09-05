import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { assertFinding, fromRow, type SmartMoneyFinding } from "@/lib/smartmoney/types";

/* ---------------------------------------------------------------------------
   Smart-money findings, read from the table the scheduled scan writes.

   No engine call and no SEC request happens here. The scan runs on its own
   schedule in CI and writes to Supabase; this route reads what is there. That
   is what makes the feed independent of any machine — including the one
   serving this request, which does no work beyond a select.

   Each row is validated individually, so one malformed row does not lose the
   rest and the reason is reportable rather than a blank feed.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

export interface SmartMoneyResponse {
  findings: SmartMoneyFinding[];
  count: number;
  /** Null when the read succeeded. */
  error: string | null;
  /** Rows the scan wrote that failed validation here, with the reason. */
  rejected: string[];
  /** When the newest finding was computed, so the UI can show staleness. */
  lastScanAt: string | null;
  /** True when the table does not exist yet — the migration has not been run. */
  needsMigration: boolean;
}

function empty(
  error: string,
  needsMigration = false,
): NextResponse<SmartMoneyResponse> {
  return NextResponse.json({
    findings: [], count: 0, error, rejected: [], lastScanAt: null, needsMigration,
  });
}

export async function GET(request: Request): Promise<NextResponse<SmartMoneyResponse>> {
  const params = new URL(request.url).searchParams;

  const limitParam = params.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return empty(`limit must be an integer in 1..${MAX_LIMIT}`);
  }

  let query = serviceClient()
    .from("smart_money_findings")
    .select("*")
    .order("observed_at", { ascending: false })
    .order("score", { ascending: false })
    .limit(limit);

  const kind = params.get("kind");
  if (kind !== null) query = query.eq("kind", kind);
  const ticker = params.get("ticker");
  if (ticker !== null) query = query.eq("ticker", ticker.toUpperCase());

  const { data, error } = await query;

  if (error) {
    /* The table not existing is reported distinctly, because the fix is one
       SQL statement rather than a debugging session and a generic
       "unavailable" would hide that.

       Two codes, not one. Postgres raises 42P01 (undefined_table), but
       PostgREST answers from its own schema cache and raises PGRST205 with a
       different message before Postgres is ever asked. Checking only 42P01
       matched nothing against a real Supabase project — the user saw
       "Could not find the table ... in the schema cache" and no instruction. */
    const needsMigration = error.code === "42P01" || error.code === "PGRST205";
    return empty(
      needsMigration
        ? "smart_money_findings does not exist — run migrations/0002_smart_money.sql"
        : `${error.code ?? "error"}: ${error.message}`,
      needsMigration,
    );
  }

  const findings: SmartMoneyFinding[] = [];
  const rejected: string[] = [];
  for (const row of data ?? []) {
    try {
      findings.push(assertFinding(fromRow(row as Record<string, unknown>)));
    } catch (validationError: unknown) {
      rejected.push(
        validationError instanceof Error ? validationError.message : "unknown",
      );
    }
  }

  const lastScanAt =
    findings
      .map((f) => f.computedAt)
      .sort()
      .at(-1) ?? null;

  return NextResponse.json({
    findings,
    count: findings.length,
    error: null,
    rejected,
    lastScanAt,
    needsMigration: false,
  });
}
