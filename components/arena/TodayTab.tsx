"use client";

import { untilText } from "@/components/arena/LeagueTab";
import { Card, pctTone, rating } from "@/components/arena/parts";
import { Button } from "@/components/ui/Button";
import { pctText } from "@/lib/arena/league";
import { LABEL_TEXT } from "@/lib/arena/review";
import type { ArenaResponse, LeagueSummary } from "@/lib/arena/types";
import { useAutomation } from "@/lib/autotrade/useAutomation";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";
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

/* "2nd of 6". English needs the ordinal's suffix, so each suffix is its own
   key; Chinese writes every one of them the same way. */
function placeText(t: Translator, rank: number, managers: number): string {
  const teen = rank % 100 >= 11 && rank % 100 <= 13;
  const last = rank % 10;
  if (!teen && last === 1) return t("{rank}st of {managers}", { rank, managers });
  if (!teen && last === 2) return t("{rank}nd of {managers}", { rank, managers });
  if (!teen && last === 3) return t("{rank}rd of {managers}", { rank, managers });
  return t("{rank}th of {managers}", { rank, managers });
}

function LeagueLine({ league, now }: { league: LeagueSummary; now: number | null }) {
  const t = useT();
  if (league.status === "forming") return <p className="type-body-sm text-text-secondary">{t("Waiting for managers. The invite code is in League.")}</p>;
  if (league.status === "drafting") {
    const left = league.onClock === null || now === null ? null : Date.parse(league.onClock.deadline) - now;
    return (
      <p className={cn("type-body-sm", league.onClock?.me ? "text-text-primary" : "text-text-secondary")}>
        {league.onClock === null
          ? t("The draft is wrapping up.")
          : league.onClock.me
            ? t("You are on the clock")
            : t("@{handle} is on the clock", { handle: league.onClock.handle })}
        {left !== null && left > 0 && <> · {t("{time} left", { time: untilText(left, t) })}</>}
      </p>
    );
  }
  if (league.status === "done") {
    return (
      <p className="type-body-sm text-text-secondary">
        {t("Finished")}
        {league.record !== null && <> · {t("you went {record}", { record: league.record })}</>}
        {league.champion !== null && <> · {t("champion @{handle}", { handle: league.champion })}</>}
      </p>
    );
  }
  const m = league.matchup;
  return (
    <div className="flex flex-col gap-0.5">
      {m !== null && (
        <p className="type-data text-text-primary">
          {league.round === 0 ? t("Round 1:") + " " : ""}
          {m.opponent === null ? (
            t("A bye this round")
          ) : (
            <>
              {t("You")} <span className={pctTone(m.mine)}>{pctText(m.mine)}</span> <span className="text-text-muted">{t("vs")}</span> @{m.opponent}{" "}
              <span className={pctTone(m.theirs)}>{pctText(m.theirs)}</span>
              {m.live && <span className="type-label text-text-muted"> · {t("in play")}</span>}
            </>
          )}
        </p>
      )}
      <p className="type-label text-text-muted">
        {league.round === 0
          ? t("The season starts at 00:00 UTC")
          : league.round > league.rounds
            ? t("The last round is being settled")
            : t("Round {round} of {rounds}", { round: league.round, rounds: league.rounds })}
        {league.record !== null && <> · {league.record}</>}
        {league.rank !== null && <> · {placeText(t, league.rank, league.managers)}</>}
      </p>
    </div>
  );
}

export function TodayTab({ data, onGo }: { data: ArenaResponse; onGo: (tab: ArenaTab, league?: string) => void }) {
  const t = useT();
  const now = useSecond();
  const automation = useAutomation();
  const puzzle = data.puzzle;
  const open = data.myCalls.filter((call) => call.status === "open").sort((a, b) => a.resolvesAt.localeCompare(b.resolvesAt));
  const trades = (automation.data?.trades ?? []).filter((trade) => trade.status === "open" || trade.status === "opening");
  const lastReview = data.reviews[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Card title={t("Today")} right={<span className="type-label text-text-muted">{t("Points and paper only")}</span>}>
        <p className="type-body-sm text-text-secondary">
          {t("Play the day's chart, run your league, make a call, take a paper trade. Every score here is judgment — never how much or how often you trade.")}
        </p>

        <Tile
          eyebrow={puzzle === null ? t("Puzzle") : t("Puzzle #{number}", { number: puzzle.number })}
          action={
            <Button size="xs" variant={puzzle !== null && puzzle.answer === null ? "accent" : "quiet"} onClick={() => onGo("puzzle")}>
              {puzzle !== null && puzzle.answer === null ? t("Play today's chart") : t("See the puzzle")}
            </Button>
          }
        >
          {puzzle === null ? (
            <p className="type-body-sm text-text-secondary">{data.puzzleError ?? t("Today's chart is being prepared.")}</p>
          ) : puzzle.answer === null ? (
            <p className="type-body-sm text-text-secondary">
              {t("Not played yet. Rating {rating}", { rating: rating(puzzle.rating) })}
              {puzzle.streak > 0 && <> · {t("a {count}-day streak to keep", { count: puzzle.streak })}</>}
            </p>
          ) : (
            <p className="type-body-sm text-text-primary">
              <span className={puzzle.answer.correct ? "text-positive" : "text-negative"}>{puzzle.answer.correct ? t("Correct") : t("Wrong")}</span> ·{" "}
              {t("rating {rating}", { rating: rating(puzzle.answer.ratingAfter) })} ·{" "}
              {puzzle.streak === 1 ? t("1 day in a row") : t("{count} days in a row", { count: puzzle.streak })}
            </p>
          )}
        </Tile>

        {data.leagues.length === 0 ? (
          <Tile
            eyebrow={t("League")}
            action={
              <Button size="xs" variant="quiet" onClick={() => onGo("league")}>
                {t("Start or join a league")}
              </Button>
            }
          >
            <p className="type-body-sm text-text-secondary">{t("Draft markets with friends, then go head-to-head every round.")}</p>
          </Tile>
        ) : (
          data.leagues.slice(0, 3).map((league) => (
            <Tile
              key={league.id}
              eyebrow={league.name}
              action={
                <Button size="xs" variant={league.onClock?.me ? "accent" : "quiet"} onClick={() => onGo("league", league.id)}>
                  {league.onClock?.me ? t("Make your pick") : league.status === "drafting" ? t("Watch the draft") : t("Open the league")}
                </Button>
              }
            >
              <LeagueLine league={league} now={now} />
            </Tile>
          ))
        )}

        <Tile
          eyebrow={t("Calls")}
          action={
            <Button size="xs" variant="quiet" onClick={() => onGo("calls")}>
              {open.length === 0 ? t("Make a call") : t("See your calls")}
            </Button>
          }
        >
          {open.length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("No open calls. Say what a market does, and how sure you are.")}</p>
          ) : (
            <p className="type-body-sm text-text-secondary">
              {t("{count} open · next:", { count: open.length })} <span className="text-text-primary">{open[0].statement}</span>
            </p>
          )}
          {data.calibration.brier !== null && (
            <p className="type-label text-text-muted">
              {data.calibration.settled === 1
                ? t("Brier {brier} over 1 call", { brier: data.calibration.brier.toFixed(3) })
                : t("Brier {brier} over {settled} calls", { brier: data.calibration.brier.toFixed(3), settled: data.calibration.settled })}
            </p>
          )}
        </Tile>

        <Tile
          eyebrow={t("Trades")}
          action={
            <Button size="xs" variant="quiet" onClick={() => onGo("trades")}>
              {trades.length === 0 ? t("Take a paper trade") : t("See your trades")}
            </Button>
          }
        >
          <p className="type-body-sm text-text-secondary">
            {trades.length === 0 ? t("Nothing open.") : t("{count} open.", { count: trades.length })}
            {lastReview !== null && (
              <>
                {" "}
                {t("Last review:")} <span className="text-text-primary">{t(LABEL_TEXT[lastReview.label])}</span>, {lastReview.facts.coin}{" "}
                {lastReview.facts.side === "long" ? t("long") : t("short")}
                {now !== null && <>, {formatRelativeTime(lastReview.createdAt, now, t.locale)}</>}.
              </>
            )}
          </p>
        </Tile>
      </Card>
    </div>
  );
}
