import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import { BRIEFING_HOUR_UTC, type Briefing, type BriefingExtras, type BriefingItem, type BriefingResponse } from "@/lib/briefing/types";

/* ---------------------------------------------------------------------------
   A published Daily Briefing for anyone to read: the day asked for, or the
   latest, with the days there are to page through.
--------------------------------------------------------------------------- */

const ARCHIVE_DAYS = 60;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_EXTRAS: BriefingExtras = { gainers: [], losers: [], yields: [], signals: [] };

/** The next publication, when today's is not out yet. */
export function nextPublication(now: number, latest: string | null): string | null {
  const today = new Date(now).toISOString().slice(0, 10);
  if (latest === today) return null;
  const at = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate(), BRIEFING_HOUR_UTC);
  /* Due already — it is being written on the next tick. */
  return new Date(at <= now ? now + 5 * 60_000 : at).toISOString();
}

export async function readBriefing(requested: string | null, now: number = Date.now()): Promise<BriefingResponse> {
  const db = serviceClient();
  const days = await db
    .from("daily_briefings")
    .select("day")
    .eq("status", "published")
    .order("day", { ascending: false })
    .limit(ARCHIVE_DAYS);
  if (days.error !== null) {
    return { briefing: null, days: [], nextAt: null, error: "The Daily Briefing needs database migration 0027." };
  }
  const list = (days.data ?? []).map((row) => String(row.day));
  const day = requested !== null && DAY.test(requested) && list.includes(requested) ? requested : (list[0] ?? null);
  const nextAt = nextPublication(now, list[0] ?? null);
  if (day === null) return { briefing: null, days: list, nextAt, error: null };

  const { data, error } = await db
    .from("daily_briefings")
    .select("day, published_at, items, extras")
    .eq("day", day)
    .eq("status", "published")
    .maybeSingle();
  if (error !== null || data === null || data.published_at === null) {
    return { briefing: null, days: list, nextAt, error: "That briefing could not be read." };
  }
  const briefing: Briefing = {
    day: String(data.day),
    publishedAt: data.published_at,
    items: Array.isArray(data.items) ? (data.items as BriefingItem[]) : [],
    extras: { ...EMPTY_EXTRAS, ...((data.extras ?? {}) as Partial<BriefingExtras>) },
  };
  return { briefing, days: list, nextAt, error: null };
}
