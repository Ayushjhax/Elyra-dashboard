import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { EventsFeed } from "@/components/events/EventsFeed";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Events: crypto's history and Elyra's AI posts as a feed, beside the chart
   like every other route. The page lives in components/events.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Events", "Every major hack, collapse, upgrade and milestone in crypto, with Elyra's AI posting as new ones happen.");
}

export default function EventsPage() {
  return (
    <RouteDrawer label={msg("Events")} icon={<Newspaper size={28} strokeWidth={1.5} />} title={msg("Events")} subtitle={msg("Crypto's history, and what just happened")}>
      <EventsFeed />
    </RouteDrawer>
  );
}
