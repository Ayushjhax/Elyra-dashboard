import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DeskView } from "@/components/desk/DeskView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   The Desk, beside the chart like every other route — the chart stays mounted
   and in focus. A committee of AI models from different labs forecasts one
   market question together and is scored on it. The page lives in
   components/desk; the procedure in lib/desk.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(
    "Desk",
    "A committee of AI models from Anthropic, Cohere, Google and others forecasts one market question together, by a fixed procedure, and is scored on it. Words only — it never trades.",
  );
}

export default function DeskPage() {
  return (
    <RouteDrawer label={msg("Desk")} icon={<Users size={28} strokeWidth={1.5} />} title={msg("Desk")} subtitle={msg("Many models, one committee")}>
      <DeskView />
    </RouteDrawer>
  );
}
