import { Newspaper } from "lucide-react";
import { EventsFeed } from "@/components/events/EventsFeed";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Events: crypto's history and Elyra's AI posts as a feed, beside the chart
   like every other route. The page lives in components/events.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Events · Elyra",
  description: "Every major hack, collapse, upgrade and milestone in crypto, with Elyra's AI posting as new ones happen.",
};

export default function EventsPage() {
  return (
    <RouteDrawer label="Events" icon={<Newspaper size={28} strokeWidth={1.5} />} title="Events" subtitle="Crypto's history, and what just happened">
      <EventsFeed />
    </RouteDrawer>
  );
}
