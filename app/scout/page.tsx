import type { Metadata } from "next";
import { Suspense } from "react";
import { Radar } from "lucide-react";
import { ScoutView } from "@/components/scout/ScoutView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Scout — read any video, post or article with its claims graded, follow
   smart money and official listings into auto-buys, scan Polymarket and
   keep paper baskets — beside the chart like every other route. The page
   lives in components/scout; the rules in lib/scout and lib/poly.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Scout", "Read any YouTube video, post or article with every claim graded by its evidence, see what smart money did, set auto-buys, and scan Polymarket.");
}

export default function ScoutPage() {
  return (
    <RouteDrawer label={msg("Scout")} icon={<Radar size={28} strokeWidth={1.5} />} title={msg("Scout")} subtitle={msg("Evidence first, then smart money")}>
      <Suspense>
        <ScoutView />
      </Suspense>
    </RouteDrawer>
  );
}
