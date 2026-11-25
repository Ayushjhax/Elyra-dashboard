"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CopyButton, Done, Label, Problem, ShareLine, field, pctTone } from "@/components/arena/parts";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  MAX_ROUNDS,
  MIN_ROUNDS,
  MOVES_PER_ROUND,
  PICK_CLOCKS,
  ROSTER_SIZES,
  capacity,
  marketName,
  pctText,
  recordText,
} from "@/lib/arena/league";
import type { ArenaResponse, LeagueMatchupView, LeagueSide, LeagueSummary, LeagueView } from "@/lib/arena/types";
import type { ArenaFeed } from "@/lib/arena/useArena";
import { useArenaLeague, type LeagueFeed } from "@/lib/arena/useArenaLeague";
import { MARKET_GROUP_LABEL, PERP_MARKETS, type MarketGroup } from "@/lib/autotrade/rules";
import { useT } from "@/lib/i18n/client";
import { msg, type Translator } from "@/lib/i18n/translate";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Leagues: fantasy sport, played with markets.

   Friends join by code and snake-draft markets — once a market is picked,
   nobody else in the league can hold it — then go head-to-head every round,
   a day or a week, on the average move of their lineups. A table, a
   champion, and the commentator's recap after every round.

   Points and paper only: nothing is staked, nothing is won but the table.
   The rules live in lib/arena/league.ts; this file only shows them.
--------------------------------------------------------------------------- */

const CLOCK_TEXT: Record<number, string> = { 120: msg("2-minute picks"), 3600: msg("1-hour picks"), 28800: msg("8-hour picks") };
const CLOCK_OPTION: Record<number, string> = { 120: msg("2 minutes"), 3600: msg("1 hour"), 28800: msg("8 hours") };
const GROUPS: readonly MarketGroup[] = ["crypto", "meme", "nasdaq"];
const groupOf = (coin: string): MarketGroup => PERP_MARKETS.find((market) => market.coin === coin)?.group ?? "crypto";

export function settingsText(t: Translator, league: Pick<LeagueView, "rosterSize" | "rounds" | "roundDays" | "pickSeconds">): string {
  const values = { markets: league.rosterSize, rounds: league.rounds, clock: t(CLOCK_TEXT[league.pickSeconds] ?? msg("timed picks")) };
  return league.roundDays === 1
    ? t("{markets} markets each · {rounds} daily rounds · {clock}", values)
    : t("{markets} markets each · {rounds} weekly rounds · {clock}", values);
}

/** "1:32", "3h 12m", "2d 4h": how long until a moment. */
export function untilText(ms: number, t: Translator): string {
  if (ms <= 0) return t("now");
  const seconds = Math.floor(ms / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return t("{hours}h {minutes}m", { hours, minutes: Math.floor((seconds % 3600) / 60) });
  return t("{days}d {hours}h", { days: Math.floor(hours / 24), hours: hours % 24 });
}

/* ---- creating and joining ---- */

function CreateLeague({ feed, onDone }: { feed: ArenaFeed; onDone: (id: string) => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: "", rosterSize: "5", rounds: "6", roundDays: "7", pickSeconds: "120" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void feed
          .write("/api/arena/leagues", "POST", {
            action: "create",
            name: form.name,
            rosterSize: Number(form.rosterSize),
            rounds: Number(form.rounds),
            roundDays: Number(form.roundDays),
            pickSeconds: Number(form.pickSeconds),
          })
          .then((result) => {
            setProblem(result.error);
            if (result.error === null && typeof result.body.id === "string") onDone(result.body.id);
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="league-name">{t("League name")}</Label>
          <input id="league-name" className={field} value={form.name} onChange={set("name")} placeholder={t("Friday desk")} maxLength={40} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="league-roster">{t("Markets each")}</Label>
          <select id="league-roster" className={field} value={form.rosterSize} onChange={set("rosterSize")}>
            {ROSTER_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="league-rounds">{t("Rounds")}</Label>
          <select id="league-rounds" className={field} value={form.rounds} onChange={set("rounds")}>
            {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, index) => MIN_ROUNDS + index).map((count) => (
              <option key={count} value={String(count)}>
                {count}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="league-length">{t("A round lasts")}</Label>
          <select id="league-length" className={field} value={form.roundDays} onChange={set("roundDays")}>
            <option value="1">{t("A day")}</option>
            <option value="7">{t("A week")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="league-clock">{t("Pick clock")}</Label>
          <select id="league-clock" className={field} value={form.pickSeconds} onChange={set("pickSeconds")}>
            {PICK_CLOCKS.map((seconds) => (
              <option key={seconds} value={String(seconds)}>
                {t(CLOCK_OPTION[seconds])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="type-label text-text-muted">
        {t(
          "Up to {managers} managers with {markets} markets each. Two-minute picks suit a live draft night; eight-hour picks, a slow one. You will get an invite code to send.",
          { managers: capacity(Number(form.rosterSize)), markets: form.rosterSize },
        )}
      </p>
      <div>
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          {t("Create league")}
        </Button>
      </div>
      <Problem text={problem} />
    </form>
  );
}

function JoinLeague({ feed, onDone }: { feed: ArenaFeed; onDone: (id: string) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void feed
          .write("/api/arena/leagues", "POST", { action: "join", code })
          .then((result) => {
            setProblem(result.error);
            if (result.error === null && typeof result.body.id === "string") {
              setCode("");
              onDone(result.body.id);
            }
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="league-code">{t("Join with a code")}</Label>
          <input id="league-code" className={field} value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("8 letters")} autoCapitalize="characters" />
        </div>
        <Button type="submit" size="sm" variant="quiet" disabled={busy}>
          {t("Join")}
        </Button>
      </div>
      <Problem text={problem} />
    </form>
  );
}

function HandleFirst({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  const t = useT();
  const [handle, setHandle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Card title={t("Choose a handle")}>
      <p className="type-body-sm text-text-secondary">{t("A league shows its managers by handle — never by wallet. Pick one to create or join a league.")}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void feed.write("/api/arena/profile", "POST", { handle, public: data.profile.public }).then((result) => setProblem(result.error));
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="league-handle">{t("Handle")}</Label>
          <input id="league-handle" className={field} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder={t("3–20 letters, numbers or _")} />
        </div>
        <Button type="submit" size="sm" variant="accent">
          {t("Save handle")}
        </Button>
      </form>
      <Problem text={problem} />
    </Card>
  );
}

/* ---- a league, forming ---- */

function Forming({ league, feed, onGone }: { league: LeagueView; feed: LeagueFeed; onGone: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const room = capacity(league.rosterSize);
  const invite = t('Join my Elyra league "{name}" with the code {code}. Points only: we draft markets and go head-to-head.', {
    name: league.name,
    code: league.inviteCode,
  });
  const run = (body: Record<string, unknown>, done?: () => void) => {
    setBusy(true);
    void feed
      .act(body)
      .then((result) => {
        setProblem(result.error);
        if (result.error === null) done?.();
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
        <span className="type-label text-text-muted">{t("Invite code")}</span>
        <span className="type-mono-addr min-w-0 flex-1 text-text-primary">{league.inviteCode}</span>
        <CopyButton text={league.inviteCode} label={t("Copy the invite code for {name}", { name: league.name })} />
      </div>
      <ShareLine text={invite} label={t("Copy an invite to send")} />
      <div className="flex flex-col gap-1.5">
        <h3 className="type-eyebrow text-text-muted">
          {t("Managers · {count} of {room}", { count: league.managers.length, room })}
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {league.managers.map((manager) => (
            <li key={manager.handle} className="type-data-sm rounded-chip border border-border-subtle bg-surface-base px-2 py-0.5 text-text-primary">
              @{manager.handle}
              {manager.owner && <span className="type-label text-text-muted"> · {t("league owner")}</span>}
            </li>
          ))}
        </ul>
      </div>
      <p className="type-label text-text-muted">
        {t(
          "When the draft starts, slots are dealt at random and the league closes to new managers. The season starts at the first 00:00 UTC after the last pick.",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {league.owner && (
          <Button size="sm" variant="accent" disabled={busy || league.managers.length < 2} onClick={() => run({ action: "start" })}>
            {league.managers.length < 2 ? t("Start the draft — needs two managers") : t("Start the draft")}
          </Button>
        )}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => run({ action: "leave" }, onGone)}>
          {league.owner ? t("Close the league") : t("Leave the league")}
        </Button>
      </div>
      <Problem text={problem} />
    </div>
  );
}

/* ---- a league, drafting ---- */

function DraftRoom({ league, feed }: { league: LeagueView; feed: LeagueFeed }) {
  const t = useT();
  const now = useSecond();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clock = league.draft.onClock;
  const left = clock === null || now === null ? null : Date.parse(clock.deadline) - now;
  const mine = league.draft.picks.filter((pick) => pick.me).map((pick) => pick.market);
  const recent = [...league.draft.picks].reverse();
  const pick = (market: string) => {
    setBusy(market);
    setProblem(null);
    void feed
      .act({ action: "pick", market })
      .then((result) => setProblem(result.error))
      .finally(() => setBusy(null));
  };
  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        aria-live="polite"
        className={cn("flex flex-col gap-0.5 rounded-card border px-3 py-2", clock?.me ? "border-border-accent bg-surface-hover" : "border-border-subtle bg-surface-base")}
      >
        <span className="type-label text-text-muted">
          {t("Pick {pick} of {total}", { pick: (clock?.pick ?? league.draft.picks.length) + 1, total: league.draft.total })}
        </span>
        <span className="type-h2 text-text-primary">{clock === null ? t("The draft is wrapping up") : clock.me ? t("You are on the clock") : t("@{handle} is on the clock", { handle: clock.handle })}</span>
        {left !== null && (
          <span className={cn("type-data", left < 30_000 ? "text-caution" : "text-text-secondary")}>
            {t("{time} left · then the first market on the board is picked", { time: untilText(left, t) })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-eyebrow text-text-muted">{clock?.me ? t("Choose a market") : t("On the board")}</h3>
        {GROUPS.map((group) => {
          const markets = league.draft.board.filter((coin) => groupOf(coin) === group);
          if (markets.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1.5">
              <span className="type-label text-text-secondary">{t(MARKET_GROUP_LABEL[group])}</span>
              <div className="flex flex-wrap gap-1.5">
                {markets.map((coin) =>
                  clock?.me ? (
                    <Button key={coin} size="xs" variant="quiet" disabled={busy !== null} aria-label={t("Draft {market}", { market: marketName(coin) })} onClick={() => pick(coin)}>
                      {busy === coin ? t("Drafting") : marketName(coin)}
                    </Button>
                  ) : (
                    <span key={coin} className="type-data-sm rounded-chip border border-border-subtle px-2 py-0.5 text-text-secondary">
                      {marketName(coin)}
                    </span>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Problem text={problem} />

      <div className="flex flex-col gap-1.5">
        <h3 className="type-eyebrow text-text-muted">{t("Your roster · {count} of {size}", { count: mine.length, size: league.rosterSize })}</h3>
        <p className="type-data-sm text-text-primary">{mine.length === 0 ? t("Nothing yet.") : mine.map(marketName).join(", ")}</p>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="type-eyebrow text-text-muted">{t("Picks")}</h3>
          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
            {recent.slice(0, 12).map((entry) => (
              <li key={entry.pick} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-2 px-2.5 py-1.5">
                <span className="type-label text-text-muted">
                  {entry.round}.{(entry.pick % league.managers.length) + 1}
                </span>
                <span className="type-data-sm min-w-0 truncate text-text-primary">{marketName(entry.market)}</span>
                <span className="type-label text-text-muted">
                  {entry.me ? t("you") : `@${entry.handle}`}
                  {entry.auto && ` · ${t("auto")}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ---- a league, in season ---- */

function SideColumn({ side, align }: { side: LeagueSide | null; align: "start" | "end" }) {
  const t = useT();
  if (side === null) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", align === "end" && "items-end text-right")}>
        <span className="type-label text-text-muted">{t("Bye")}</span>
        <span className="type-body-sm text-text-secondary">{t("No opponent this round.")}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", align === "end" && "items-end text-right")}>
      <span className="type-label truncate text-text-secondary">{side.me ? t("You") : `@${side.handle}`}</span>
      <span className={cn("type-h1 tabular-nums", pctTone(side.pct))}>{pctText(side.pct)}</span>
      <ul className="flex flex-col gap-0.5">
        {side.markets.map((entry) => (
          <li key={entry.market} className={cn("type-data-sm flex gap-2", align === "end" && "flex-row-reverse")}>
            <span className="min-w-0 truncate text-text-secondary">{marketName(entry.market)}</span>
            <span className={cn("tabular-nums", pctTone(entry.pct))}>{pctText(entry.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const resultText = (matchup: LeagueMatchupView, t: Translator): string => {
  if (matchup.away === null) return t("Bye");
  if (matchup.result === null) return matchup.live ? t("In play") : t("Not started");
  if (matchup.result === "void") return t("No result");
  if (matchup.result === "tie") return t("Tied");
  const winner = matchup.result === "home" ? matchup.home : matchup.away;
  return winner.me ? t("You won") : t("@{handle} won", { handle: winner.handle });
};

function Scoreboard({ matchup, heading }: { matchup: LeagueMatchupView; heading: string }) {
  const t = useT();
  const mineFirst = matchup.away?.me === true;
  const left = mineFirst ? matchup.away : matchup.home;
  const right = mineFirst ? matchup.home : matchup.away;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="type-eyebrow text-text-muted">{heading}</span>
        <span className={cn("type-label", matchup.live ? "text-text-primary" : "text-text-muted")}>{resultText(matchup, t)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <SideColumn side={left} align="start" />
        <span className="type-label pt-5 text-text-muted">{t("vs")}</span>
        <SideColumn side={right} align="end" />
      </div>
    </div>
  );
}

function MatchupLine({ matchup }: { matchup: LeagueMatchupView }) {
  const t = useT();
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 py-1.5">
      <span className="type-data-sm min-w-0 truncate text-text-primary">
        @{matchup.home.handle} <span className={pctTone(matchup.home.pct)}>{pctText(matchup.home.pct)}</span>
        {matchup.away === null ? (
          <span className="text-text-muted"> · {t("bye")}</span>
        ) : (
          <>
            {" "}
            <span className="text-text-muted">{t("vs")}</span> @{matchup.away.handle} <span className={pctTone(matchup.away.pct)}>{pctText(matchup.away.pct)}</span>
          </>
        )}
      </span>
      <span className="type-label text-text-muted">{resultText(matchup, t)}</span>
    </li>
  );
}

function Moves({ league, feed }: { league: LeagueView; feed: LeagueFeed }) {
  const t = useT();
  const mine = league.rosters.find((roster) => roster.me);
  const [drop, setDrop] = useState("");
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (mine === undefined) return null;
  const changed = mine.held.filter((market) => !mine.lineup.includes(market));
  const canMove = league.status === "active" && league.movesLeft > 0 && league.freeAgents.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="type-label text-text-muted">{t("This round's lineup")}</span>
        <span className="type-data-sm text-text-primary">{mine.lineup.map(marketName).join(", ")}</span>
      </div>
      {changed.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="type-label text-text-muted">{t("Next round's lineup")}</span>
          <span className="type-data-sm text-text-primary">{mine.held.map(marketName).join(", ")}</span>
        </div>
      )}
      {league.status === "active" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setDone(null);
            void feed
              .act({ action: "move", drop, add })
              .then((result) => {
                setProblem(result.error);
                if (result.error === null) {
                  setDone(t("{added} joins your lineup next round; {dropped} counts through this one.", { added: marketName(add), dropped: marketName(drop) }));
                  setDrop("");
                  setAdd("");
                }
              })
              .finally(() => setBusy(false));
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="league-drop">{t("Drop from roster")}</Label>
              <select id="league-drop" className={field} value={drop} onChange={(event) => setDrop(event.target.value)} disabled={!canMove}>
                <option value="">{t("Choose")}</option>
                {mine.held.map((market) => (
                  <option key={market} value={market}>
                    {marketName(market)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="league-add">{t("Add a free agent")}</Label>
              <select id="league-add" className={field} value={add} onChange={(event) => setAdd(event.target.value)} disabled={!canMove}>
                <option value="">{t("Choose")}</option>
                {GROUPS.map((group) => (
                  <optgroup key={group} label={t(MARKET_GROUP_LABEL[group])}>
                    {league.freeAgents
                      .filter((coin) => groupOf(coin) === group)
                      .map((coin) => (
                        <option key={coin} value={coin}>
                          {marketName(coin)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <p className="type-label text-text-muted">
            {t(
              "{left} of {moves} moves left this round. A move counts from the next round; the market you drop still counts for this one, then anyone can add it.",
              { left: league.movesLeft, moves: MOVES_PER_ROUND },
            )}
          </p>
          <div>
            <Button type="submit" size="sm" variant="quiet" disabled={!canMove || busy || drop === "" || add === ""}>
              {t("Make the move")}
            </Button>
          </div>
          <Done text={done} />
          <Problem text={problem} />
        </form>
      )}
    </div>
  );
}

function Season({ league, feed }: { league: LeagueView; feed: LeagueFeed }) {
  const t = useT();
  const now = useSecond();
  const round = league.season?.round ?? 0;
  const current = league.schedule.find((entry) => entry.round === Math.max(1, Math.min(round, league.rounds)));
  const settledRounds = league.schedule.filter((entry) => entry.matchups.length > 0 && entry.matchups.every((matchup) => matchup.result !== null));
  const lastRecap = [...settledRounds].reverse().find((entry) => entry.recap !== null);
  const startsIn = league.season === null || now === null ? null : Date.parse(league.season.startsAt) - now;
  const endsIn = current === undefined || now === null ? null : Date.parse(current.endsAt) - now;

  let banner: string;
  if (league.status === "done") banner = t("The season is over");
  else if (round === 0) banner = startsIn === null ? t("The season starts soon") : t("Round 1 starts in {time}", { time: untilText(startsIn, t) });
  else if (round > league.rounds) banner = t("The last round is being settled");
  else {
    banner = t("Round {round} of {rounds}", { round, rounds: league.rounds });
    if (endsIn !== null) banner += ` · ${endsIn > 0 ? t("ends in {time}", { time: untilText(endsIn, t) }) : t("settling")}`;
  }

  return (
    <div className="flex flex-col gap-3">
      {league.status === "done" && league.champion !== null && (
        <div className="flex items-center gap-3 rounded-card border border-border-strong bg-surface-base px-3 py-2">
          <Trophy size={20} strokeWidth={1.5} className="shrink-0 text-text-primary" aria-hidden />
          <div className="flex flex-col">
            <span className="type-label text-text-muted">{t("Champion")}</span>
            <span className="type-h2 text-text-primary">{league.standings[0]?.me ? t("You") : `@${league.champion}`}</span>
          </div>
        </div>
      )}
      <p className="type-data text-text-secondary">{banner}</p>

      {league.myMatchup !== null && league.status === "active" && (
        <Scoreboard matchup={league.myMatchup} heading={round === 0 ? t("Round 1") : t("Round {round}", { round: league.myMatchup.round })} />
      )}

      {current !== undefined && current.matchups.length > 1 && league.status === "active" && (
        <div className="flex flex-col gap-1">
          <h3 className="type-eyebrow text-text-muted">{t("Every matchup this round")}</h3>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {current.matchups.map((matchup) => (
              <MatchupLine key={`${matchup.round}-${matchup.home.handle}`} matchup={matchup} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className="type-eyebrow flex items-center gap-1.5 text-text-muted">
          {t("League table")}
          <InfoTip text={t("A win is worth 1, a tie a half. Level teams are split by points for: the sum of their round scores.")} />
        </h3>
        <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
          {league.standings.map((row) => (
            <li
              key={row.handle}
              className={cn("grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] items-baseline gap-3 px-2.5 py-1.5", row.me && "bg-surface-hover")}
            >
              <span className="type-data-sm text-text-muted">{row.rank}</span>
              <span className="type-data-sm min-w-0 truncate text-text-primary">
                @{row.handle}
                {row.me && <span className="type-label text-text-muted"> · {t("you")}</span>}
              </span>
              <span className="type-data-sm text-text-primary">{recordText(row)}</span>
              <span className={cn("type-data-sm text-right tabular-nums", pctTone(row.played === 0 ? null : row.pointsFor))}>{row.played === 0 ? "—" : pctText(row.pointsFor)}</span>
            </li>
          ))}
        </ol>
      </div>

      {lastRecap !== undefined && (
        <div className="flex flex-col gap-1.5">
          <h3 className="type-eyebrow text-text-muted">{t("Round {round} recap", { round: lastRecap.round })}</h3>
          <p className="type-body-sm text-text-secondary">{lastRecap.recap}</p>
        </div>
      )}
      {league.share !== null && <ShareLine text={league.share} label={t("Copy your last result")} />}

      {league.status === "active" && (
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <h3 className="type-eyebrow text-text-muted">{t("Your roster")}</h3>
          <Moves league={league} feed={feed} />
        </div>
      )}

      {settledRounds.length > 0 && (
        <details className="group flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <summary className="type-label cursor-pointer text-text-secondary hover:text-text-primary">{t("Results, round by round")}</summary>
          <div className="mt-2 flex flex-col gap-3">
            {[...settledRounds].reverse().map((entry) => (
              <div key={entry.round} className="flex flex-col gap-1">
                <span className="type-label text-text-muted">{t("Round {round}", { round: entry.round })}</span>
                <ul className="flex flex-col divide-y divide-border-subtle">
                  {entry.matchups.map((matchup) => (
                    <MatchupLine key={`${matchup.round}-${matchup.home.handle}`} matchup={matchup} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        <summary className="type-label cursor-pointer text-text-secondary hover:text-text-primary">{t("Every roster")}</summary>
        <ul className="mt-2 flex flex-col divide-y divide-border-subtle">
          {league.rosters.map((roster) => (
            <li key={roster.handle} className="flex flex-col gap-0.5 py-1.5">
              <span className="type-label text-text-muted">{roster.me ? t("You") : `@${roster.handle}`}</span>
              <span className="type-data-sm text-text-primary">{roster.held.map(marketName).join(", ")}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const STATUS_TEXT = { forming: msg("Forming"), drafting: msg("Drafting"), active: msg("In season"), done: msg("Finished") } as const;

function LeagueDetail({ id, onGone }: { id: string; onGone: () => void }) {
  const t = useT();
  const feed = useArenaLeague(id);
  const league = feed.data;
  if (league === null) {
    return (
      <Card title={t("League")}>
        {feed.error !== null ? <Problem text={feed.error} /> : <p className="type-body-sm text-text-secondary">{t("Reading the league…")}</p>}
      </Card>
    );
  }
  return (
    <Card title={league.name} right={<span className="type-label shrink-0 text-text-muted">{t(STATUS_TEXT[league.status])}</span>}>
      <p className="type-label text-text-muted">{settingsText(t, league)}</p>
      {league.status === "forming" && <Forming league={league} feed={feed} onGone={onGone} />}
      {league.status === "drafting" && <DraftRoom league={league} feed={feed} />}
      {(league.status === "active" || league.status === "done") && <Season league={league} feed={feed} />}
    </Card>
  );
}

function HowItWorks() {
  const t = useT();
  return (
    <ul className="type-body-sm flex list-disc flex-col gap-1 pl-5 text-text-secondary">
      <li>
        {t(
          "Friends join with a code and snake-draft markets — crypto, memecoins, Nasdaq stocks. Once a market is picked, nobody else in the league can hold it.",
        )}
      </li>
      <li>{t("Then it is head-to-head, a day or a week a round. Your score is the average move of your lineup over the round; the better score wins.")}</li>
      <li>{t("Two free-agent moves a round, a table, a champion, and a recap after every round. Points only — nothing is staked.")}</li>
    </ul>
  );
}

export function LeagueTab({ data, feed, focus, onFocus }: { data: ArenaResponse; feed: ArenaFeed; focus: string | null; onFocus: (id: string | null) => void }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const leagues: LeagueSummary[] = data.leagues;
  const selected = leagues.find((entry) => entry.id === focus)?.id ?? leagues[0]?.id ?? null;
  const open = (id: string) => {
    setAdding(false);
    onFocus(id);
  };

  if (data.profile.handle === null) {
    return (
      <div className="flex flex-col gap-3">
        <Card title={t("Leagues")}>
          <HowItWorks />
        </Card>
        <HandleFirst data={data} feed={feed} />
      </div>
    );
  }

  if (leagues.length === 0 || adding) {
    return (
      <div className="flex flex-col gap-3">
        {leagues.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t("Start a league")}
            body={t("Fantasy sport, played with markets. Draft with friends, then go head-to-head every round.")}
          />
        ) : (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("Back to your leagues")}
            </Button>
          </div>
        )}
        <Card title={t("How a league works")}>
          <HowItWorks />
        </Card>
        <Card title={t("New league")}>
          <CreateLeague feed={feed} onDone={open} />
        </Card>
        <Card title={t("Join a league")}>
          <JoinLeague feed={feed} onDone={open} />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Your leagues")}>
        {leagues.map((entry) => (
          <Button key={entry.id} size="xs" variant={entry.id === selected ? "accent" : "quiet"} aria-pressed={entry.id === selected} onClick={() => onFocus(entry.id)}>
            {entry.name}
            {entry.onClock?.me && ` · ${t("your pick")}`}
          </Button>
        ))}
        <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
          {t("New or join")}
        </Button>
      </div>
      {selected !== null && <LeagueDetail key={selected} id={selected} onGone={() => onFocus(null)} />}
    </div>
  );
}
