import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { FundsView } from "@/components/funds/FundsView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Funds — autonomous AI funds over the person's own capital, beside the
   chart like every other route. The page lives in components/funds; the
   rules in lib/funds and docs/AI_FUNDS.md.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Funds", "Launch an AI-managed fund: you write the charter, an AI agent trades inside it, and Elyra marks the book, enforces the limits and keeps a sealed record.");
}

export default function FundsPage() {
  return (
    <RouteDrawer label={msg("Funds")} icon={<Landmark size={28} strokeWidth={1.5} />} title={msg("Funds")} subtitle={msg("Autonomous AI funds on your own capital")}>
      <FundsView />
    </RouteDrawer>
  );
}
