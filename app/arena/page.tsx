import { Swords } from "lucide-react";
import { ArenaView } from "@/components/arena/ArenaView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Elyra Arena, beside the chart like every other route — the chart stays
   mounted and in focus. The page lives in components/arena.

   ?tab= opens a tab and ?trade= points at one trade's review (the link from
   a closed trade in /automation). They are read here, on the server, and
   handed down, so the view needs no search-params hook and no Suspense
   boundary of its own.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Arena · Elyra",
  description: "A daily chart puzzle, calls with receipts and a review of every trade. Points and paper only.",
};

const one = (value: string | string[] | undefined): string | null => (typeof value === "string" && value !== "" ? value : null);

export default async function ArenaPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const query = await searchParams;
  return (
    <RouteDrawer label="Arena" icon={<Swords size={28} strokeWidth={1.5} />} title="Arena" subtitle="Judgment, scored">
      <ArenaView initialTab={one(query.tab)} trade={one(query.trade)} />
    </RouteDrawer>
  );
}
