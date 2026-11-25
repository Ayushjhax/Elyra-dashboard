import type { BasketTotals } from "@/lib/poly/basketMath";
import type { BookSum, Mover, PolyConsensus } from "@/lib/poly/scanMath";

/* What the Poly scan and baskets routes answer. */

export const POLY_CATEGORIES = ["overall", "politics", "crypto", "sports"] as const;
export type PolyCategory = (typeof POLY_CATEGORIES)[number];

export interface PolyScanResponse {
  category: PolyCategory;
  smartMoney: PolyConsensus[];
  wallets: { read: number; asked: number };
  /** Which of the three reads answered, so an empty list is told from an unread one. */
  read: { smartMoney: boolean; markets: boolean; events: boolean };
  movers: Mover[];
  bookSums: BookSum[];
  at: string;
  errors: string[];
}

export interface BasketLegView {
  id: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  question: string;
  slug: string | null;
  eventSlug: string | null;
  costUsd: number;
  shares: number;
  entryPrice: number;
  /** What selling the shares into the bids raises now. */
  valueUsd: number | null;
  /** 1 won, 0 lost, null open. */
  settled: number | null;
}

export interface BasketView extends BasketTotals {
  id: string;
  name: string;
  stakeUsd: number;
  createdAt: string;
  legs: BasketLegView[];
}

export interface BasketsResponse {
  baskets: BasketView[];
  error: string | null;
}
