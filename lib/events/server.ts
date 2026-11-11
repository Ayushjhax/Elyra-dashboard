import "server-only";

import { defillamaHacks } from "@/lib/events/defillama";
import { historyItems, pageFeed, type RawHack } from "@/lib/events/feed";
import { FILTERS, type EventCategory, type EventFilter, type EventItem, type EventsPage } from "@/lib/events/types";
import { serviceClient } from "@/lib/supabase/server";
import type { EventPostRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The events feed for a viewer — anyone may read it; a signed-in viewer also
   sees what they liked and saved — and the one write a person can make: a
   like or a save on an item.
--------------------------------------------------------------------------- */

export class EventsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const KEY = /^(post|hack|milestone):[A-Za-z0-9._-]{1,80}$/;
const POST_CATEGORY: Record<EventPostRow["kind"], EventCategory> = { hack: "hack", move: "market", onthisday: "milestone" };

export function postItem(row: EventPostRow): EventItem {
  const amount = row.amount_usd === null ? null : Number(row.amount_usd);
  return {
    key: `post:${row.id}`,
    source: "ai",
    category: POST_CATEGORY[row.kind],
    at: row.created_at,
    title: row.title,
    body: row.body,
    amountUsd: amount !== null && Number.isFinite(amount) ? amount : null,
    returnedUsd: null,
    chains: row.chains ?? [],
    detail: null,
    link: row.source_url === null ? null : { label: new URL(row.source_url).hostname.replace(/^www\./, ""), url: row.source_url },
    model: row.model,
    refersTo: row.refers_to,
    likes: 0,
    liked: false,
    saved: false,
  };
}

export async function eventsFeed(viewer: string | null, query: { filter: string | null; before: string | null }): Promise<EventsPage> {
  const filter: EventFilter = FILTERS.some((option) => option.id === query.filter) ? (query.filter as EventFilter) : "all";
  if (filter === "saved" && viewer === null) return { items: [], next: null, signedIn: false, error: null };
  const db = serviceClient();

  const [posts, hacks, saves] = await Promise.all([
    db.from("event_posts").select("*").order("created_at", { ascending: false }).limit(500),
    defillamaHacks().catch((): RawHack[] => []),
    viewer === null || filter !== "saved" ? Promise.resolve({ data: [] as { item_key: string }[] }) : db.from("event_marks").select("item_key").eq("user_id", viewer).eq("mark", "save"),
  ]);

  const items = [...(posts.data ?? []).map((row) => postItem(row as EventPostRow)), ...historyItems(hacks)];
  const before = query.before !== null && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|/.test(query.before) ? query.before : null;
  const page = pageFeed(items, { filter, before, savedKeys: new Set((saves.data ?? []).map((row) => row.item_key)) });

  /* Likes and the viewer's own marks, for this page only. */
  const keys = page.items.map((item) => item.key);
  if (keys.length > 0) {
    const marks = await db.from("event_marks").select("item_key, user_id, mark").in("item_key", keys);
    for (const mark of marks.data ?? []) {
      const item = page.items.find((candidate) => candidate.key === mark.item_key);
      if (item === undefined) continue;
      if (mark.mark === "like") item.likes += 1;
      if (mark.user_id === viewer) {
        if (mark.mark === "like") item.liked = true;
        if (mark.mark === "save") item.saved = true;
      }
    }
  }

  const error = posts.error !== null ? "Elyra's posts could not be read. Events need database migration 0023." : hacks.length === 0 ? "DefiLlama's hack list could not be read just now." : null;
  return { items: page.items, next: page.next, signedIn: viewer !== null, error };
}

export async function setMark(userId: string, input: Record<string, unknown>): Promise<void> {
  const itemKey = typeof input.itemKey === "string" ? input.itemKey : "";
  if (!KEY.test(itemKey)) throw new EventsError("No such item.", 404);
  if (input.mark !== "like" && input.mark !== "save") throw new EventsError("Choose like or save.");
  const db = serviceClient();
  if (input.on === true) {
    const { error } = await db
      .from("event_marks")
      .upsert({ item_key: itemKey, user_id: userId, mark: input.mark }, { onConflict: "item_key,user_id,mark", ignoreDuplicates: true });
    if (error !== null) throw new EventsError("That could not be saved. Events need database migration 0023.", 503);
  } else {
    const { error } = await db.from("event_marks").delete().eq("item_key", itemKey).eq("user_id", userId).eq("mark", input.mark);
    if (error !== null) throw new EventsError("That could not be saved.", 503);
  }
}
