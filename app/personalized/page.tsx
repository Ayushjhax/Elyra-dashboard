"use client";

import { CapitalIntelligence } from "@/components/personalized/CapitalIntelligence";

/* ---------------------------------------------------------------------------
   Capital Intelligence — Elyra's assistant, grounded in your own account.

   Like Assets, this route takes the whole workspace body rather than opening
   beside the chart; see FULL_BLEED_ROUTES in lib/layout.ts. The page itself
   lives in components/personalized.
--------------------------------------------------------------------------- */

export default function PersonalizedPage() {
  return <CapitalIntelligence />;
}
