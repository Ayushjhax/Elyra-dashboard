import type { Metadata } from "next";
import { Swords } from "lucide-react";
import { ArenaView } from "@/components/arena/ArenaView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Elyra Arena, beside the chart like every other route — the chart stays
   mounted and in focus. The page lives in components/arena.

   ?tab= opens a tab, ?trade= points at one trade's review (the link from a
   closed trade in /automation) and ?league= opens one league. They are read
   here, on the server, and handed down, so the view needs no search-params
   hook and no Suspense boundary of its own.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(
    "Arena",
    "Trading as a game and a sport: a daily chart puzzle, leagues with friends, calls with receipts and a review of every paper trade. Points and paper only.",
  );
}

const one = (value: string | string[] | undefined): string | null => (typeof value === "string" && value !== "" ? value : null);

export default async function ArenaPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const query = await searchParams;
  return (
    <RouteDrawer label={msg("Arena")} icon={<Swords size={28} strokeWidth={1.5} />} title={msg("Arena")} subtitle={msg("Play, compete, trade on paper")}>
      <ArenaView initialTab={one(query.tab)} trade={one(query.trade)} league={one(query.league)} />
    </RouteDrawer>
  );
}