import { Bot } from "lucide-react";
import { AutomationView } from "@/components/automation/AutomationView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Trading automation, beside the chart like every other route — the chart
   stays mounted and in focus. The page lives in components/automation.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Automation · Elyra",
  description: "Trading rules Elyra runs on Hyperliquid, with take-profit and stop-loss on every entry.",
};

export default function AutomationPage() {
  return (
    <RouteDrawer label="Automation" icon={<Bot size={28} strokeWidth={1.5} />} title="Automation" subtitle="Rules Elyra trades for you">
      <AutomationView />
    </RouteDrawer>
  );
}
