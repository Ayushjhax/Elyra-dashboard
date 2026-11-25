import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import { shortlist } from "@/lib/briefing/candidates";
import { briefingExtras } from "@/lib/briefing/extras";
import { gatherCandidates } from "@/lib/briefing/sources";
import { BRIEFING_HOUR_UTC } from "@/lib/briefing/types";
import { writeBriefing } from "@/lib/briefing/write";

/* ---------------------------------------------------------------------------
   The Daily Briefing, written once a day by /api/briefing/run, which
   pg_cron calls four times in the first hour after BRIEFING_HOUR_UTC
   (0027_daily_briefing.sql).

   The first call writes the day's briefing from the last 24 hours; every
   later one finds the day's row and returns at once. A run claims the day by
   inserting its row as 'writing' — two calls racing write it once — and a
   claim left by a run that died is taken over after STALE_MS, up to
   MAX_ATTEMPTS. With too little to say (every source down) it waits for the
   next attempt rather than publishing a thin briefing.
--------------------------------------------------------------------------- */

const STALE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 4;
/** Fewer developments than this and the day waits for its next attempt. */
const MIN_CANDIDATES = 5;

export interface BriefingReport {
  day: string;
  published: boolean;
  items: number;
  notes: string[];
}

export const briefingDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Claim the day: true when this run is the one to write it. */
async function claim(day: string, now: number): Promise<{ claimed: boolean; note: string | null }> {
  const db = serviceClient();
  const claimedAt = new Date(now).toISOString();
  const inserted = await db.from("daily_briefings").insert({ day, claimed_at: claimedAt });
  if (inserted.error === null) return { claimed: true, note: null };
  if (inserted.error.code !== "23505") throw new Error("The Daily Briefing needs database migration 0027.");

  const { data: row, error } = await db.from("daily_briefings").select("status, attempts, claimed_at").eq("day", day).maybeSingle();
  if (error !== null || row === null) return { claimed: false, note: "could not read the day's row" };
  if (row.status === "published") return { claimed: false, note: null };
  if (now - Date.parse(row.claimed_at) < STALE_MS) return { claimed: false, note: "another run is writing it" };
  if (row.attempts >= MAX_ATTEMPTS) return { claimed: false, note: `gave up after ${row.attempts} attempts` };

  /* Compare-and-set on the claim we read, so only one run takes it over. */
  const taken = await db
    .from("daily_briefings")
    .update({ claimed_at: claimedAt, attempts: row.attempts + 1 })
    .eq("day", day)
    .eq("status", "writing")
    .eq("claimed_at", row.claimed_at)
    .select("day");
  return { claimed: (taken.data ?? []).length === 1, note: null };
}

export async function runBriefing(now: number = Date.now()): Promise<BriefingReport> {
  const day = briefingDay(now);
  const report: BriefingReport = { day, published: false, items: 0, notes: [] };
  if (new Date(now).getUTCHours() < BRIEFING_HOUR_UTC) return report;

  const db = serviceClient();
  const { data: existing } = await db.from("daily_briefings").select("status").eq("day", day).maybeSingle();
  if (existing?.status === "published") return report;

  const claimed = await claim(day, now);
  if (claimed.note !== null) report.notes.push(claimed.note);
  if (!claimed.claimed) return report;

  const gathered = await gatherCandidates(now);
  report.notes.push(...gathered.notes);
  const list = shortlist(gathered.candidates);
  if (list.length < MIN_CANDIDATES) {
    report.notes.push(`only ${list.length} developments could be read`);
    await db.from("daily_briefings").update({ notes: report.notes }).eq("day", day).eq("status", "writing");
    return report;
  }

  const [{ items, model }, extras] = await Promise.all([writeBriefing(list), briefingExtras()]);
  report.notes.push(...extras.notes);

  const { error } = await db
    .from("daily_briefings")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      items,
      extras: extras.extras,
      model,
      notes: report.notes,
    })
    .eq("day", day)
    .eq("status", "writing");
  if (error !== null) {
    report.notes.push(`could not be saved: ${error.message}`);
    return report;
  }
  report.published = true;
  report.items = items.length;
  return report;
}
