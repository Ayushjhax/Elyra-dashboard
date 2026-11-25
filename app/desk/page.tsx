import { Users } from "lucide-react";
import { DeskView } from "@/components/desk/DeskView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   The Desk, beside the chart like every other route — the chart stays mounted
   and in focus. A committee of AI models from different labs forecasts one
   market question together and is scored on it. The page lives in
   components/desk; the procedure in lib/desk.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Desk · Elyra",
  description: "A committee of AI models from Anthropic, Cohere, Google and others forecasts one market question together, by a fixed procedure, and is scored on it. Words only — it never trades.",
};

export default function DeskPage() {
  return (
    <RouteDrawer label="Desk" icon={<Users size={28} strokeWidth={1.5} />} title="Desk" subtitle="Many models, one committee">
      <DeskView />
    </RouteDrawer>
  );
}
