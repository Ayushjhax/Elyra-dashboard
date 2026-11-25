import type { Metadata } from "next";
import { ResearchWorkspace } from "@/components/research/ResearchWorkspace";
import { pageMetadata } from "@/lib/i18n/server";

/* ---------------------------------------------------------------------------
   Research.

   A full-bleed route: filings, signals, yields and unlocks are tables that do
   not fit the 640px column beside the chart. See FULL_BLEED_ROUTES.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Research", "Filings, markets, signals, yields and event intelligence.");
}

export default function ResearchPage() {
  return <ResearchWorkspace />;
}
