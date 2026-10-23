"use client";

import { CapitalAccounts } from "@/components/assets/CapitalAccounts";

/* ---------------------------------------------------------------------------
   Capital Accounts — balances, venues and capital movement in one place.

   Takes the whole workspace body rather than opening beside the chart; see
   FULL_BLEED_ROUTES in lib/layout.ts. The page lives in components/assets.
--------------------------------------------------------------------------- */

export default function AssetsPage() {
  return <CapitalAccounts />;
}
