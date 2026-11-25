import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { RailsView } from "@/components/rails/RailsView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Agents — the rails: what the person's AI agents may ask for, what they
   asked, and the ledger of it. Beside the chart like every other route; the
   page lives in components/rails.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Agents", "Give AI agents scoped permission to ask for swaps, payments and trades, approve each one, and keep a verifiable ledger of it all.");
}

export default function AgentsPage() {
  return (
    <RouteDrawer label={msg("Agents")} icon={<ShieldCheck size={28} strokeWidth={1.5} />} title={msg("Agents")} subtitle={msg("What your AI agents may do with your money")}>
      <RailsView />
    </RouteDrawer>
  );
}
