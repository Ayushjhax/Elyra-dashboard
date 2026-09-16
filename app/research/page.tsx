import { ResearchWorkspace } from "@/components/research/ResearchWorkspace";

/* ---------------------------------------------------------------------------
   Research.

   A full-bleed route: filings, signals, yields and unlocks are tables that do
   not fit the 640px column beside the chart. See FULL_BLEED_ROUTES.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Research · Elyra",
  description: "Filings, markets, signals, yields and event intelligence.",
};

export default function ResearchPage() {
  return <ResearchWorkspace />;
}
