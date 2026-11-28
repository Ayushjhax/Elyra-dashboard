import type { Metadata } from "next";
import { Copy } from "lucide-react";
import { AutomationTabs } from "@/components/copy/AutomationTabs";
import { CopyView } from "@/components/copy/CopyView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Copy trading — Automation's second page, beside the chart like every
   route, with the rail's Automation lit. Copy a shared rule set, or one of
   Elyra's own, into your own account; share sets of your own rules. The page
   lives in components/copy; the rules in lib/copy and docs/COPY_TRADING.md.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Copy trading", "Copy a shared set of automation rules, or one of Elyra's own, into your own Hyperliquid account, and share sets of your own.");
}

export default function CopyTradingPage() {
  return (
    <RouteDrawer tone="graphite" label={msg("Copy trading")} icon={<Copy size={28} strokeWidth={1.5} />} title={msg("Copy trading")} subtitle={msg("Follow a leader's trades in your own account")}>
      <AutomationTabs />
      <CopyView />
    </RouteDrawer>
  );
}
