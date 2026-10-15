"use client";

import { Referrals } from "@/components/referrals/ReferralsView";

/* ---------------------------------------------------------------------------
   Referrals — a little better, together.

   Takes the whole workspace body rather than opening beside the chart; see
   FULL_BLEED_ROUTES in lib/layout.ts. The page lives in components/referrals.
--------------------------------------------------------------------------- */

export default function ReferralsPage() {
  return <Referrals />;
}
