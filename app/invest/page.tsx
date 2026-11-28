import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { InvestList } from "@/components/invest/InvestList";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Intelligent Portfolios.

   Opens in the route column beside the chart, like Portfolio — a list of
   seven cards fits the column, so this is not a full-bleed route and the
   chart stays the focus. The page lives in components/invest; its header is
   the drawer's graphite tone, a flat tint (app/globals.css), not glass.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Intelligent Portfolios", "Model portfolios you buy into your own wallet, with their holdings and drift in plain view.");
}

export default function InvestPage() {
  return (
    <RouteDrawer
      label={msg("Intelligent Portfolios")}
      icon={<Layers size={28} strokeWidth={1.5} />}
      title={msg("Intelligent Portfolios")}
      subtitle={msg("Model portfolios held in your wallet")}
      tone="graphite"
    >
      <InvestList />
    </RouteDrawer>
  );
}
