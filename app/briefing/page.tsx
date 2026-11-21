import type { Metadata } from "next";
import { Sunrise } from "lucide-react";
import { BriefingView } from "@/components/briefing/BriefingView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   The Daily Briefing, beside the chart like every other route — the chart
   stays mounted and in focus, and a ticker in an item opens on it. Written
   once a day by lib/briefing/run.ts; the page lives in components/briefing.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Daily briefing", "Ten crypto developments a day, each from its source, with the day's movers, yields and signals.");
}

export default function BriefingPage() {
  return (
    <RouteDrawer
      label={msg("Daily briefing")}
      icon={<Sunrise size={28} strokeWidth={1.5} />}
      title={msg("Daily briefing")}
      subtitle={msg("What happened in crypto, every morning")}
    >
      <BriefingView />
    </RouteDrawer>
  );
}
