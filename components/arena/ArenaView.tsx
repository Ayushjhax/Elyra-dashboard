"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { CallsTab } from "@/components/arena/CallsTab";
import { LadderTab } from "@/components/arena/LadderTab";
import { LeagueTab } from "@/components/arena/LeagueTab";
import { PuzzleTab } from "@/components/arena/PuzzleTab";
import { TodayTab, type ArenaTab } from "@/components/arena/TodayTab";
import { TradesTab } from "@/components/arena/TradesTab";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArena } from "@/lib/arena/useArena";
import { useMinute } from "@/lib/useClock";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Elyra Arena: trading, played as a game and a sport.

     Today   — the matchday page: everything in play, at a glance
     Puzzle  — play: one real chart a day, the same for everyone
     League  — sport: draft markets with friends, head-to-head every round
     Calls   — say what happens and how sure you are, with a receipt
     Trades  — take a paper trade with a plan, and get it reviewed
     Ladder  — the puzzle's rating and calls' calibration, by handle

   Everything here is points and paper. The AI only comments — on a trade's
   review, a settled call, a league's round — from facts the code computed;
   it never makes a call and never trades. Nothing rewards trading more,
   larger or with more leverage: ratings reward calibration, a league
   rewards picking well, and the only streak is the daily puzzle's.
--------------------------------------------------------------------------- */

const TABS: readonly { value: ArenaTab; label: string }[] = [
  { value: "today", label: msg("Today") },
  { value: "puzzle", label: msg("Puzzle") },
  { value: "league", label: msg("League") },
  { value: "calls", label: msg("Calls") },
  { value: "trades", label: msg("Trades") },
  { value: "ladder", label: msg("Ladder") },
];

/* Links written before the launch layout still land in the right place. */
const LEGACY: Record<string, ArenaTab> = { reviews: "trades", groups: "ladder" };

function tabFrom(value: string | null, trade: string | null): ArenaTab {
  if (value !== null && TABS.some((tab) => tab.value === value)) return value as ArenaTab;
  if (value !== null && value in LEGACY) return LEGACY[value];
  return trade !== null ? "trades" : "today";
}

export function ArenaView({ initialTab, trade, league }: { initialTab: string | null; trade: string | null; league?: string | null }) {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useArena();
  const now = useMinute();
  const [tab, setTab] = useState<ArenaTab>(tabFrom(initialTab, trade));
  const [focus, setFocus] = useState<string | null>(league ?? null);

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) return <SkeletonRows rows={6} />;
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Swords}
        title={t("Sign in to play")}
        body={t("Trading as a game and a sport: a daily chart puzzle, leagues with friends, calls with receipts and a review of every paper trade. Scored on judgment, not on how much you trade.")}
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            {t("Sign in")}
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) return <EmptyState icon={Swords} title={t("Arena is unavailable")} body={feed.error ?? t("It will try again shortly.")} />;

  const go = (next: ArenaTab, leagueId?: string) => {
    if (leagueId !== undefined) setFocus(leagueId);
    setTab(next);
  };

  return (
    <div className="@container">
      <Tabs value={tab} onValueChange={(value) => setTab(value as ArenaTab)} className="gap-3">
        {/* Three to a row in a narrow column, one row once there is room. */}
        <TabsList aria-label={t("Arena")} className="grid grid-cols-3 @[30rem]:flex">
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="justify-center @[30rem]:justify-start">
              {t(label)}
              {value === "league" && data.leagues.some((entry) => entry.onClock?.me) && <span className="sr-only"> — {t("your pick")}</span>}
              {value === "league" && data.leagues.some((entry) => entry.onClock?.me) && <span aria-hidden className="ml-1.5 size-1.5 rounded-pill bg-accent" />}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="today">
          <TodayTab data={data} onGo={go} />
        </TabsContent>
        <TabsContent value="puzzle">
          <PuzzleTab puzzle={data.puzzle} error={data.puzzleError} feed={feed} />
        </TabsContent>
        <TabsContent value="league">
          <LeagueTab data={data} feed={feed} focus={focus} onFocus={setFocus} />
        </TabsContent>
        <TabsContent value="calls">
          <CallsTab data={data} feed={feed} now={now} />
        </TabsContent>
        <TabsContent value="trades">
          <TradesTab data={data} trade={trade} now={now} />
        </TabsContent>
        <TabsContent value="ladder">
          <LadderTab data={data} feed={feed} />
        </TabsContent>
      </Tabs>
    </div>
  );
}