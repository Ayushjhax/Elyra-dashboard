import { ShieldCheck } from "lucide-react";
import { RailsView } from "@/components/rails/RailsView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Agents — the rails: what the person's AI agents may ask for, what they
   asked, and the ledger of it. Beside the chart like every other route; the
   page lives in components/rails.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Agents · Elyra",
  description: "Give AI agents scoped permission to ask for swaps, payments and trades, approve each one, and keep a verifiable ledger of it all.",
};

export default function AgentsPage() {
  return (
    <RouteDrawer label="Agents" icon={<ShieldCheck size={28} strokeWidth={1.5} />} title="Agents" subtitle="What your AI agents may do with your money">
      <RailsView />
    </RouteDrawer>
  );
}
