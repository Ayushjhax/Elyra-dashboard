import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { AutomationView } from "@/components/automation/AutomationView";
import { AutomationTabs } from "@/components/copy/AutomationTabs";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";
import { readHandoff } from "@/lib/autotrade/handoff";

/* ---------------------------------------------------------------------------
   Trading automation, beside the chart like every other route — the chart
   stays mounted and in focus. The page lives in components/automation.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Automation", "Trading rules Elyra runs on Hyperliquid, with take-profit and stop-loss on every entry.");
}

/* A backtest's "Run on paper" lands here with its strategy, market and
   timeframe in the query (lib/autotrade/handoff.ts); it only fills the form. */
export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const handoff = readHandoff(await searchParams);
  return (
    <RouteDrawer label={msg("Automation")} icon={<Bot size={28} strokeWidth={1.5} />} title={msg("Automation")} subtitle={msg("Rules Elyra trades for you")}>
      <AutomationTabs />
      <AutomationView handoff={handoff} />
    </RouteDrawer>
  );
}
