import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { StrategiesView } from "@/components/strategies/StrategiesView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Strategies — design, library and AI lab, every strategy backtested on real
   history — beside the chart like every other route. The page lives in
   components/strategies; the rules in lib/strategies.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Strategies", "Design trading strategies from rules, start from Elyra's library or ask Elyra's AI, and backtest each on real market history.");
}

export default function StrategiesPage() {
  return (
    <RouteDrawer label={msg("Strategies")} icon={<FlaskConical size={28} strokeWidth={1.5} />} title={msg("Strategies")} subtitle={msg("Design, test and compare trading rules")}>
      <StrategiesView />
    </RouteDrawer>
  );
}
