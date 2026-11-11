/* The events feed, as the page reads it. Pure. */

export type EventCategory = "hack" | "collapse" | "upgrade" | "halving" | "etf" | "regulation" | "milestone" | "market";

export type EventFilter = "all" | "hacks" | "collapses" | "upgrades" | "policy" | "market" | "saved";

export const FILTERS: Array<{ id: EventFilter; label: string; categories: EventCategory[] | null }> = [
  { id: "all", label: "All", categories: null },
  { id: "hacks", label: "Hacks", categories: ["hack"] },
  { id: "collapses", label: "Collapses", categories: ["collapse"] },
  { id: "upgrades", label: "Upgrades & halvings", categories: ["upgrade", "halving"] },
  { id: "policy", label: "ETFs & regulation", categories: ["etf", "regulation"] },
  { id: "market", label: "Markets & milestones", categories: ["market", "milestone"] },
  { id: "saved", label: "Saved", categories: null },
];

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  hack: "Hack",
  collapse: "Collapse",
  upgrade: "Upgrade",
  halving: "Halving",
  etf: "ETF",
  regulation: "Regulation",
  milestone: "Milestone",
  market: "Market move",
};

export interface EventItem {
  /** "post:<uuid>", "hack:<defillama id>" or "milestone:<slug>". */
  key: string;
  /** Who it comes from: Elyra's AI, DefiLlama's hack list, or Elyra's reviewed history. */
  source: "ai" | "defillama" | "history";
  category: EventCategory;
  /** When it happened (history) or was posted (AI). ISO. */
  at: string;
  title: string;
  body: string;
  /** Funds lost or stolen, in dollars at the time, where recorded. */
  amountUsd: number | null;
  /** Funds returned, where DefiLlama records it. */
  returnedUsd: number | null;
  chains: string[];
  /** e.g. "Private key compromised" — DefiLlama's technique. */
  detail: string | null;
  link: { label: string; url: string } | null;
  /** The model that wrote an AI post, or "fallback" when the code wrote it. */
  model: string | null;
  /** The item an AI post is about. */
  refersTo: string | null;
  likes: number;
  liked: boolean;
  saved: boolean;
}

export interface EventsPage {
  items: EventItem[];
  /** Pass back as `before` for the next, older page; null at the end. */
  next: string | null;
  signedIn: boolean;
  error: string | null;
}
