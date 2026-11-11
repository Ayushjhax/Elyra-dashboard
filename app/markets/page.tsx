import { Globe2 } from "lucide-react";
import { WorldMarketsView } from "@/components/markets/WorldMarketsView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   The world's stock markets, beside the chart like every other route — the
   chart stays mounted and in focus, and a dollar-priced row opens on it. The
   page lives in components/markets.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "World markets · Elyra",
  description: "Every major stock market live: sessions, benchmarks, movers and currencies across Asia-Pacific, Europe and the Americas.",
};

export default function MarketsPage() {
  return (
    <RouteDrawer label="World markets" icon={<Globe2 size={28} strokeWidth={1.5} />} title="World markets" subtitle="Asia-Pacific, Europe and the Americas, live">
      <WorldMarketsView />
    </RouteDrawer>
  );
}
