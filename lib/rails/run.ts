import "server-only";

import { expireIntents } from "@/lib/rails/intents";
import { checkRequest } from "@/lib/rails/requests";
import { serviceClient } from "@/lib/supabase/server";
import type { PaymentRequestRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The rails' share of the five-minute pass: lapse intents nobody answered,
   and settle — or lapse — open payment requests from the chain, so a payment
   is recorded and its owner told even when nobody is looking at it. Capped
   per run; whatever is left is picked up five minutes later.
--------------------------------------------------------------------------- */

export const SETTLE_CAP = 25;

export interface RailsReport {
  expiredIntents: number;
  checkedRequests: number;
  settledRequests: number;
  expiredRequests: number;
}

export async function runRails(now: number = Date.now()): Promise<RailsReport> {
  const report: RailsReport = { expiredIntents: 0, checkedRequests: 0, settledRequests: 0, expiredRequests: 0 };
  report.expiredIntents = await expireIntents(now).catch(() => 0);

  const { data, error } = await serviceClient()
    .from("payment_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(SETTLE_CAP);
  if (error !== null) return report;

  for (const row of (data ?? []) as PaymentRequestRow[]) {
    const after = await checkRequest(row, now).catch(() => row);
    report.checkedRequests += 1;
    if (after.status === "paid") report.settledRequests += 1;
    if (after.status === "expired") report.expiredRequests += 1;
  }
  return report;
}
