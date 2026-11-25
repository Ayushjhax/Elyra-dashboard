"use client";

import { untilText } from "@/components/arena/LeagueTab";
import { Card, pctTone, rating } from "@/components/arena/parts";
import { Button } from "@/components/ui/Button";
import { pctText } from "@/lib/arena/league";
import { LABEL_TEXT } from "@/lib/arena/review";
import type { ArenaResponse, LeagueSummary } from "@/lib/arena/types";
import { useAutomation } from "@/lib/autotrade/useAutomation";
import { formatRelativeTime } from "@/lib/format";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Today: the Arena's matchday page. One look at everything in play — the
   day's puzzle, each league's draft or this round's score, the calls still
   open and the paper trades running — each a tap from its own tab.

   Nothing here asks anyone to trade. A line is there because something of
   the person's is already in play, or because the day's puzzle is.
--------------------------------------------------------------------------- */

export type ArenaTab = "today" | "puzzle" | "league" | "calls" | "trades" | "ladder";

function Tile({ eyebrow, children, action }: { eyebrow: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-base p-3">
      <span className="type-eyebrow text-text-muted">{eyebrow}</span>
      {children}
      {action !== undefined && <div className="pt-0.5">{action}</div>}
    </div>
  );
}

function LeagueLine({ league, now }: { league: LeagueSummary; now: number | null }) {
  if (league.status === "forming") return <p className="type-body-sm text-text-secondary">Waiting for managers. The invite code is in League.</p>;
  if (league.status === "drafting") {
    const left = league.onClock === null || now === null ? null : Date.parse(league.onClock.deadline) - now;
    return (
      <p className={cn("type-body-sm", league.onClock?.me ? "text-text-primary" : "text-text-secondary")}>
        {league.onClock === null ? "The draft is wrapping up." : league.onClock.me ? "You are on the clock" : `@${league.onClock.handle} is on the clock`}
        {left !== null && left > 0 && <> · {untilText(left)} left</>}
      </p>
    );
  }
  if (league.status === "done") {
    return (
      <p className="type-body-sm text-text-secondary">
        Finished{league.record !== null && <> · you went {league.record}</>}
        {league.champion !== null && <> · champion @{league.champion}</>}
      </p>
    );
  }
  const m = league.matchup;
  return (
    <div className="flex flex-col gap-0.5">
      {m !== null && (
        <p className="type-data text-text-primary">
          {league.round === 0 ? "Round 1: " : ""}
          {m.opponent === null ? (
            "A bye this round"
          ) : (
            <>
              You <span className={pctTone(m.mine)}>{pctText(m.mine)}</span> <span className="text-text-muted">vs</span> @{m.opponent}{" "}
              <span className={pctTone(m.theirs)}>{pctText(m.theirs)}</span>
              {m.live && <span className="type-label text-text-muted"> · live</span>}
            </>
          )}
        </p>
      )}
      <p className="type-label text-text-muted">
        {league.round === 0 ? "The season starts at 00:00 UTC" : league.round > league.rounds ? "The last round is being settled" : `Round ${league.round} of ${league.rounds}`}
        {league.record !== null && <> · {league.record}</>}
        {league.rank !== null && <> · {ordinal(league.rank)} of {league.managers}</>}
      </p>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function TodayTab({ data, onGo }: { data: ArenaResponse; onGo: (tab: ArenaTab, league?: string) => void }) {
  const now = useSecond();
  const automation = useAutomation();
  const puzzle = data.puzzle;
  const open = data.myCalls.filter((call) => call.status === "open").sort((a, b) => a.resolvesAt.localeCompare(b.resolvesAt));
  const trades = (automation.data?.trades ?? []).filter((trade) => trade.status === "open" || trade.status === "opening");
  const lastReview = data.reviews[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Card title="Today" right={<span className="type-label text-text-muted">Points and paper only</span>}>
        <p className="type-body-sm text-text-secondary">
          Play the day&apos;s chart, run your league, make a call, take a paper trade. Every score here is judgment — never how much or how often
          you trade.
        </p>

        <Tile
          eyebrow={puzzle === null ? "Puzzle" : `Puzzle #${puzzle.number}`}
          action={
            <Button size="xs" variant={puzzle !== null && puzzle.answer === null ? "accent" : "quiet"} onClick={() => onGo("puzzle")}>
              {puzzle !== null && puzzle.answer === null ? "Play today's chart" : "See the puzzle"}
            </Button>
          }
        >
          {puzzle === null ? (
            <p className="type-body-sm text-text-secondary">{data.puzzleError ?? "Today's chart is being prepared."}</p>
          ) : puzzle.answer === null ? (
            <p className="type-body-sm text-text-secondary">
              Not played yet. Rating {rating(puzzle.rating)}
              {puzzle.streak > 0 && <> · a {puzzle.streak}-day streak to keep</>}
            </p>
          ) : (
            <p className="type-body-sm text-text-primary">
              <span className={puzzle.answer.correct ? "text-positive" : "text-negative"}>{puzzle.answer.correct ? "Correct" : "Wrong"}</span> · rating{" "}
              {rating(puzzle.answer.ratingAfter)} · {puzzle.streak} {puzzle.streak === 1 ? "day" : "days"} in a row
            </p>
          )}
        </Tile>

        {data.leagues.length === 0 ? (
          <Tile
            eyebrow="League"
            action={
              <Button size="xs" variant="quiet" onClick={() => onGo("league")}>
                Start or join a league
              </Button>
            }
          >
            <p className="type-body-sm text-text-secondary">Draft markets with friends, then go head-to-head every round.</p>
          </Tile>
        ) : (
          data.leagues.slice(0, 3).map((league) => (
            <Tile
              key={league.id}
              eyebrow={league.name}
              action={
                <Button size="xs" variant={league.onClock?.me ? "accent" : "quiet"} onClick={() => onGo("league", league.id)}>
                  {league.onClock?.me ? "Make your pick" : league.status === "drafting" ? "Watch the draft" : "Open the league"}
                </Button>
              }
            >
              <LeagueLine league={league} now={now} />
            </Tile>
          ))
        )}

        <Tile
          eyebrow="Calls"
          action={
            <Button size="xs" variant="quiet" onClick={() => onGo("calls")}>
              {open.length === 0 ? "Make a call" : "See your calls"}
            </Button>
          }
        >
          {open.length === 0 ? (
            <p className="type-body-sm text-text-secondary">No open calls. Say what a market does, and how sure you are.</p>
          ) : (
            <p className="type-body-sm text-text-secondary">
              {open.length} open · next: <span className="text-text-primary">{open[0].statement}</span>
            </p>
          )}
          {data.calibration.brier !== null && (
            <p className="type-label text-text-muted">
              Brier {data.calibration.brier.toFixed(3)} over {data.calibration.settled} {data.calibration.settled === 1 ? "call" : "calls"}
            </p>
          )}
        </Tile>

        <Tile
          eyebrow="Trades"
          action={
            <Button size="xs" variant="quiet" onClick={() => onGo("trades")}>
              {trades.length === 0 ? "Take a paper trade" : "See your trades"}
            </Button>
          }
        >
          <p className="type-body-sm text-text-secondary">
            {trades.length === 0 ? "Nothing open." : `${trades.length} open.`}
            {lastReview !== null && (
              <>
                {" "}
                Last review: <span className="text-text-primary">{LABEL_TEXT[lastReview.label]}</span>, {lastReview.facts.coin} {lastReview.facts.side}
                {now !== null && <>, {formatRelativeTime(lastReview.createdAt, now)}</>}.
              </>
            )}
          </p>
        </Tile>
      </Card>
    </div>
  );
}
