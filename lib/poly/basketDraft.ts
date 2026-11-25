"use client";

import { create } from "zustand";
import { BASKET_LIMITS, type LegChoice } from "@/lib/poly/basketMath";

/* ---------------------------------------------------------------------------
   The basket being put together: outcomes picked in Poly scan, carried to
   Poly baskets. Client state only, never persisted; nothing is recorded
   until the person makes the basket.
--------------------------------------------------------------------------- */

interface BasketDraft {
  legs: LegChoice[];
  toggle: (leg: LegChoice) => void;
  remove: (tokenId: string) => void;
  replace: (legs: LegChoice[]) => void;
  clear: () => void;
}

export const useBasketDraft = create<BasketDraft>((set) => ({
  legs: [],
  toggle: (leg) =>
    set((state) => {
      if (state.legs.some((entry) => entry.tokenId === leg.tokenId)) return { legs: state.legs.filter((entry) => entry.tokenId !== leg.tokenId) };
      /* One outcome per market: picking another outcome of the same market swaps it. */
      const others = state.legs.filter((entry) => entry.conditionId !== leg.conditionId);
      return others.length >= BASKET_LIMITS.maxLegs ? state : { legs: [...others, leg] };
    }),
  remove: (tokenId) => set((state) => ({ legs: state.legs.filter((entry) => entry.tokenId !== tokenId) })),
  replace: (legs) => set({ legs: legs.slice(0, BASKET_LIMITS.maxLegs) }),
  clear: () => set({ legs: [] }),
}));
