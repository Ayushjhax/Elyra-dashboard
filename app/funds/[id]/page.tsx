import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { FundView } from "@/components/funds/FundView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   One AI fund, beside the chart. A fund is private to its account, so the
   server cannot read it here (the session is the browser's); the view
   reads it, and a malformed id is a 404 before anything is asked.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Fund", "An AI-managed fund: its book, record, risk limits, manager and sealed history.");
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FundPage(props: Props) {
  const { id } = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return (
    <RouteDrawer label={msg("Fund")} icon={<Landmark size={28} strokeWidth={1.5} />} title={msg("Fund")} subtitle={msg("Managed by AI, held to your charter")}>
      <FundView id={id} />
    </RouteDrawer>
  );
}
