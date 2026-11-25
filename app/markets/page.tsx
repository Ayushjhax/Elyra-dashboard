import type { Metadata } from "next";
import { Globe2 } from "lucide-react";
import { WorldMarketsView } from "@/components/markets/WorldMarketsView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   The world's stock markets, beside the chart like every other route — the
   chart stays mounted and in focus, and a dollar-priced row opens on it. The
   page lives in components/markets.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("World markets", "Every major stock market live: sessions, benchmarks, movers and currencies across Asia-Pacific, Europe and the Americas.");
}

export default function MarketsPage() {
  return (
    <RouteDrawer label={msg("World markets")} icon={<Globe2 size={28} strokeWidth={1.5} />} title={msg("World markets")} subtitle={msg("Asia-Pacific, Europe and the Americas, live")}>
      <WorldMarketsView />
    </RouteDrawer>
  );
}
