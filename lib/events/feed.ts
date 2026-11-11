import { MILESTONES, type Milestone } from "@/lib/events/history";
import { FILTERS, type EventFilter, type EventItem } from "@/lib/events/types";

/* ---------------------------------------------------------------------------
   The events feed, built and paged. Pure.

   Three sources become one timeline, newest first: Elyra's AI posts, DefiLlama's
   hack list and the reviewed milestones. A hack the AI has already posted
   about shows once, as the post. Paging is by a cursor of "<at>|<key>", so a
   page boundary never splits or repeats an item even when two share a date.
--------------------------------------------------------------------------- */

/** DefiLlama's hack record, as https://api.llama.fi/hacks returns it. */
export interface RawHack {
  date: number;
  name: string;
  amount: number | null;
  chain: string[] | null;
  classification: string | null;
  technique: string | null;
  description: string | null;
  source: string | null;
  returnedFunds: number | null;
  defillamaId: string | number | null;
  targetType?: string | null;
  bridgeHack?: boolean | null;
}

/** Hacks below this are left out of the history; the list holds over a thousand. */
export const HISTORY_MIN_USD = 5_000_000;
/** A new hack the AI posts about: recorded in the last three days, at least this large. */
export const POST_MIN_USD = 1_000_000;
export const POST_WINDOW_MS = 3 * 86_400_000;
/** "On this day" picks hacks at least this large. */
export const ANNIVERSARY_MIN_USD = 100_000_000;
export const PAGE_SIZE = 30;

const DEFILLAMA_HACKS = { label: "DefiLlama", url: "https://defillama.com/hacks" };

/** "$6.36 billion", "$470 million", "$820,000". */
export function formatAmountUsd(value: number): string {
  if (value >= 1e9) return `$${Number((value / 1e9).toFixed(2))} billion`;
  if (value >= 1e6) return `$${Number((value / 1e6).toFixed(1))} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** A stable key for a hack: DefiLlama's id, else its name and date. */
export function hackKey(hack: RawHack): string {
  const id = hack.defillamaId === null || hack.defillamaId === undefined ? "" : String(hack.defillamaId).trim();
  if (/^[A-Za-z0-9._-]{1,40}$/.test(id)) return `hack:${id}`;
  return `hack:${slug(`${hack.name}-${new Date(hack.date * 1000).toISOString().slice(0, 10)}`)}`;
}

const safeUrl = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const hostLabel = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export function hackItem(hack: RawHack): EventItem {
  const amount = typeof hack.amount === "number" && Number.isFinite(hack.amount) && hack.amount > 0 ? hack.amount : null;
  const returned = typeof hack.returnedFunds === "number" && hack.returnedFunds > 0 ? hack.returnedFunds : null;
  const chains = (hack.chain ?? []).filter((chain) => typeof chain === "string" && chain.length > 0);
  const description = (hack.description ?? "").replace(/\s+/g, " ").trim();
  const method = [hack.classification, hack.technique].filter((part): part is string => typeof part === "string" && part.length > 0).join(": ");
  const source = safeUrl(hack.source);
  return {
    key: hackKey(hack),
    source: "defillama",
    category: "hack",
    at: new Date(hack.date * 1000).toISOString(),
    title: amount === null ? `${hack.name} is exploited` : `${hack.name}: ${formatAmountUsd(amount)} taken`,
    body: description.length > 0 ? (description.length > 600 ? `${description.slice(0, 597)}…` : description) : method.length > 0 ? `${method}.` : "Recorded by DefiLlama.",
    amountUsd: amount,
    returnedUsd: returned,
    chains,
    detail: hack.technique ?? hack.classification ?? null,
    link: source === null ? DEFILLAMA_HACKS : { label: hostLabel(source), url: source },
    model: null,
    refersTo: null,
    likes: 0,
    liked: false,
    saved: false,
  };
}

export function milestoneItem(milestone: Milestone): EventItem {
  return {
    key: `milestone:${milestone.slug}`,
    source: "history",
    category: milestone.category,
    at: `${milestone.date}T00:00:00.000Z`,
    title: milestone.title,
    body: milestone.body,
    amountUsd: null,
    returnedUsd: null,
    chains: [],
    detail: null,
    link: milestone.link,
    model: null,
    refersTo: null,
    likes: 0,
    liked: false,
    saved: false,
  };
}

/** The history: every milestone, and every hack of at least HISTORY_MIN_USD. */
export function historyItems(hacks: readonly RawHack[]): EventItem[] {
  return [
    ...MILESTONES.map(milestoneItem),
    ...hacks.filter((hack) => (hack.amount ?? 0) >= HISTORY_MIN_USD && Number.isFinite(hack.date)).map(hackItem),
  ];
}

const newestFirst = (a: EventItem, b: EventItem) => (a.at === b.at ? (a.key < b.key ? 1 : -1) : a.at < b.at ? 1 : -1);
const cursorOf = (item: EventItem) => `${item.at}|${item.key}`;

/** Whether `item` sorts after (is older than) the cursor. */
function olderThan(item: EventItem, cursor: string): boolean {
  const [at, key] = [cursor.slice(0, cursor.indexOf("|")), cursor.slice(cursor.indexOf("|") + 1)];
  return item.at < at || (item.at === at && item.key < key);
}

export function pageFeed(
  items: readonly EventItem[],
  options: { filter: EventFilter; before: string | null; limit?: number; savedKeys?: ReadonlySet<string> },
): { items: EventItem[]; next: string | null } {
  /* An AI post about an item replaces that item. */
  const covered = new Set(items.filter((item) => item.source === "ai" && item.refersTo !== null).map((item) => item.refersTo as string));
  const categories = FILTERS.find((filter) => filter.id === options.filter)?.categories ?? null;
  const limit = Math.min(Math.max(options.limit ?? PAGE_SIZE, 1), 100);
  const eligible = items
    .filter((item) => !covered.has(item.key))
    .filter((item) => (options.filter === "saved" ? (options.savedKeys?.has(item.key) ?? false) : categories === null || categories.includes(item.category)))
    .filter((item) => options.before === null || olderThan(item, options.before))
    .sort(newestFirst);
  const page = eligible.slice(0, limit);
  return { items: page, next: eligible.length > limit ? cursorOf(page[page.length - 1]) : null };
}

/** Items from earlier years on the same calendar day as `date` ("YYYY-MM-DD"). */
export function onThisDay(items: readonly EventItem[], date: string): EventItem[] {
  const monthDay = date.slice(5, 10);
  const year = date.slice(0, 4);
  return items
    .filter((item) => item.source !== "ai" && item.at.slice(5, 10) === monthDay && item.at.slice(0, 4) < year)
    .filter((item) => item.category !== "hack" || (item.amountUsd ?? 0) >= ANNIVERSARY_MIN_USD)
    .sort(newestFirst);
}

/** Hacks recorded in the window before `now`, large enough to post about, largest first. */
export function postableHacks(hacks: readonly RawHack[], now: number): RawHack[] {
  return hacks
    .filter((hack) => (hack.amount ?? 0) >= POST_MIN_USD && hack.date * 1000 <= now && now - hack.date * 1000 <= POST_WINDOW_MS)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
}
