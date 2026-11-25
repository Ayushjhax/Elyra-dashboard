"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Card, Label, Problem, field } from "@/components/arena/parts";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HORIZONS, NOTE_LIMIT, type HorizonId, type Stage } from "@/lib/desk/protocol";
import type { DeskResponse, DeskRunView, DeskTurnView } from "@/lib/desk/types";
import { useDesk, type DeskFeed } from "@/lib/desk/useDesk";
import { marketFor } from "@/lib/autotrade/rules";
import { formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Desk: a committee of AI models from different labs that forecasts one
   market question together, by a fixed procedure, and is scored on it.

   The page shows the committee at work — who is seated, the stage it is at,
   each member's view before and after review, the pooled vote and the memo
   with its dissent — and the scoreboard that says whether the committee
   beats its best member. Words only: the Desk never trades. The procedure
   is in lib/desk/protocol.ts.
--------------------------------------------------------------------------- */

const STEPS: readonly { stage: Stage; label: string }[] = [
  { stage: "facts", label: "Fact sheet" },
  { stage: "brief", label: "Assignments" },
  { stage: "independent", label: "Independent views" },
  { stage: "review", label: "Anonymised review" },
  { stage: "memo", label: "Vote and memo" },
  { stage: "done", label: "Done" },
];
const stepIndex = (stage: Stage) => (stage === "vote" ? 4 : STEPS.findIndex((step) => step.stage === stage));

const pctTone = (p: number | null) => (p === null ? "text-text-muted" : p > 52 ? "text-positive" : p < 48 ? "text-negative" : "text-text-primary");
const marketLabel = (coin: string) => marketFor(coin)?.label ?? coin;

function untilText(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/* ---- convening ---- */

function Convene({ data, feed, onConvened }: { data: DeskResponse; feed: DeskFeed; onConvened: (id: string) => void }) {
  const [market, setMarket] = useState("BTC");
  const [horizon, setHorizon] = useState<HorizonId>("24h");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const voters = data.seats.filter((seat) => seat.seated && seat.votes).length;
  const working = data.runs.some((run) => run.stage !== "done" && run.stage !== "failed");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void feed
          .write("/api/desk", "POST", { market, horizon, note })
          .then((result) => {
            setProblem(result.error);
            if (result.error === null && typeof result.body.id === "string") {
              setNote("");
              onConvened(result.body.id);
            }
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="desk-market">Market</Label>
          <select id="desk-market" className={field} value={market} onChange={(event) => setMarket(event.target.value)}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="desk-horizon">Settles in</Label>
          <select id="desk-horizon" className={field} value={horizon} onChange={(event) => setHorizon(event.target.value as HorizonId)}>
            {HORIZONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="desk-note">Anything for the desk to weigh (optional)</Label>
          <input id="desk-note" className={field} value={note} maxLength={NOTE_LIMIT} onChange={(event) => setNote(event.target.value)} placeholder="An event, a worry, a hunch" />
        </div>
      </div>
      <p className="type-label text-text-muted">
        The question is always one the market will settle: will it close above its price now, at that time? {voters} {voters === 1 ? "member" : "members"} will
        vote. {data.runsLeft} of {data.runsPerDay} sessions left today.
      </p>
      <div>
        <Button type="submit" size="sm" variant="accent" disabled={busy || working || data.runsLeft === 0 || voters < 2}>
          {working ? "The desk is in session" : busy ? "Convening" : "Convene the desk"}
        </Button>
      </div>
      <Problem text={problem} />
    </form>
  );
}

/* ---- a run ---- */

function Stepper({ run }: { run: DeskRunView }) {
  const at = run.stage === "failed" ? -1 : stepIndex(run.stage);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Where the desk is">
      {STEPS.map((step, index) => (
        <li
          key={step.stage}
          aria-current={index === at ? "step" : undefined}
          className={cn(
            "type-label",
            index < at || run.stage === "done" ? "text-text-secondary" : index === at ? "text-text-primary underline underline-offset-4" : "text-text-muted",
          )}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function MemberRow({ turns }: { turns: DeskTurnView[] }) {
  const first = turns.find((turn) => turn.round === "independent");
  const review = turns.find((turn) => turn.round === "review");
  const head = review ?? first;
  if (head === undefined) return null;
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-data-sm min-w-0 truncate text-text-primary">
          {head.title} <span className="type-label text-text-muted">· {head.lab} · {head.model}</span>
        </span>
        <span className="type-data-sm shrink-0 tabular-nums">
          {first?.p !== null && first?.p !== undefined && review?.p !== undefined && review.p !== null && review.p !== first.p && (
            <span className="text-text-muted">{first.p}% → </span>
          )}
          <span className={pctTone(head.p)}>{head.p === null ? "—" : `${head.p}%`}</span>
        </span>
      </div>
      {first?.thesis && <p className={cn("type-body-sm", first.flagged ? "text-caution" : "text-text-secondary")}>{first.thesis}</p>}
      {review?.thesis && review.thesis.length > 0 && (
        <p className={cn("type-label", review.flagged ? "text-caution" : "text-text-muted")}>
          After review: {review.thesis}
        </p>
      )}
      <span className="type-label text-text-muted">
        {head.error ?? (review?.weight !== null && review?.weight !== undefined ? `Weight ${review.weight.toFixed(2)}` : first !== undefined && review === undefined ? "Waiting for review" : "")}
        {review?.brier !== null && review?.brier !== undefined && <> · Brier {review.brier.toFixed(3)}</>}
      </span>
    </li>
  );
}

function RunCard({ run, data }: { run: DeskRunView; data: DeskResponse }) {
  const now = useSecond();
  const seats = [...new Set(run.turns.map((turn) => turn.seat))];
  const working = run.stage !== "done" && run.stage !== "failed";
  const answered = new Set(run.turns.filter((turn) => turn.round === (run.stage === "review" ? "review" : "independent")).map((turn) => turn.seat));
  const voters = data.seats.filter((seat) => seat.seated && seat.votes);
  const settleIn = now === null ? null : Date.parse(run.resolvesAt) - now;
  return (
    <Card title={`${marketLabel(run.market)}, ${HORIZONS.find((entry) => entry.id === run.horizon)?.label ?? run.horizon}`} right={<span className="type-label shrink-0 text-text-muted">{now !== null && formatRelativeTime(run.createdAt, now)}</span>}>
      <p className="type-data-sm text-text-primary">Will it be true? {run.statement}.</p>
      {run.note !== null && <p className="type-label text-text-muted">Your note: {run.note}</p>}
      <Stepper run={run} />

      {working && (run.stage === "independent" || run.stage === "review") && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Members">
          {voters.map((seat) => (
            <li key={seat.id} className={cn("type-label rounded-chip border px-2 py-0.5", answered.has(seat.id) ? "border-border-strong text-text-primary" : "border-border-subtle text-text-muted")}>
              {seat.title}
              {answered.has(seat.id) ? " · in" : " · working"}
            </li>
          ))}
        </ul>
      )}
      {run.stage === "failed" && <Problem text={run.error ?? "The desk stopped partway."} />}

      {run.pFinal !== null && (
        <div className="flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-base p-3">
          <span className="type-eyebrow text-text-muted">The desk</span>
          <span className={cn("type-h1 tabular-nums", pctTone(run.pFinal))}>{run.pFinal}%</span>
          <span className="type-label text-text-muted">
            that it closes higher{run.pIndependent !== null && run.pIndependent !== run.pFinal && <> · {run.pIndependent}% before review</>}
            {run.spread !== null && <> · members {Math.round(run.spread)} points apart</>}
          </span>
          {run.dissent !== null && (
            <span className="type-label text-text-secondary">
              Dissent: the {run.dissent.title} at {run.dissent.p}%
            </span>
          )}
        </div>
      )}

      {run.memo !== null && (
        <div className="flex flex-col gap-1">
          <h3 className="type-eyebrow text-text-muted">The chair&apos;s memo</h3>
          <p className="type-body-sm text-text-secondary">{run.memo}</p>
        </div>
      )}

      {run.stage === "done" && (
        <p className="type-label text-text-muted">
          {run.status === "open"
            ? `Settles ${settleIn === null ? "" : `in ${untilText(settleIn)} `}on Hyperliquid's one-minute close.`
            : run.status === "void"
              ? "Void: Hyperliquid had no price for that minute, so it does not count."
              : `Closed at ${formatPriceUsd(run.settledPrice)}: ${run.status === "up" ? "higher" : "not higher"}. Every forecast in this run is now scored.`}
        </p>
      )}

      {seats.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <h3 className="type-eyebrow text-text-muted">The members</h3>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {seats.map((seat) => (
              <MemberRow key={seat} turns={run.turns.filter((turn) => turn.seat === seat)} />
            ))}
          </ul>
        </div>
      )}

      {run.facts.length > 0 && (
        <details className="border-t border-border-subtle pt-3">
          <summary className="type-label cursor-pointer text-text-secondary hover:text-text-primary">The fact sheet every member read</summary>
          <ul className="type-label mt-2 flex list-disc flex-col gap-0.5 pl-5 text-text-muted">
            {run.facts.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/* ---- the scoreboard ---- */

function Scoreboard({ data }: { data: DeskResponse }) {
  const rows = data.scoreboard;
  const desk = rows.find((row) => row.title === "The desk");
  const best = rows.find((row) => row.title !== "The desk");
  return (
    <Card
      title="Scoreboard"
      right={<InfoTip text="Brier score: the squared distance between a forecast and what happened. 0 is perfect; always saying 50% scores 0.250. Lower is better. It counts every settled call, across everyone who has convened the desk." />}
    >
      {rows.length === 0 ? (
        <p className="type-body-sm text-text-secondary">Nothing has settled yet. Each call is scored when its time comes, and the board fills in.</p>
      ) : (
        <>
          {desk !== undefined && best !== undefined && desk.brier !== null && best.brier !== null && (
            <p className="type-body-sm text-text-secondary">
              {desk.brier < best.brier
                ? `The desk is beating its best member: ${desk.brier.toFixed(3)} against ${best.brier.toFixed(3)}.`
                : `The best member, the ${best.title}, is ahead of the desk: ${best.brier.toFixed(3)} against ${desk.brier.toFixed(3)}.`}
              {desk.independentBrier !== null &&
                (desk.brier < desk.independentBrier ? " The review round is helping." : desk.brier > desk.independentBrier ? " So far the review round is not helping." : "")}
            </p>
          )}
          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
            {rows.map((row, index) => (
              <li key={row.key} className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-baseline gap-3 px-2.5 py-1.5", row.title === "The desk" && "bg-surface-hover")}>
                <span className="type-data-sm text-text-muted">{index + 1}</span>
                <span className="type-data-sm min-w-0 truncate text-text-primary">
                  {row.title}
                  {row.model !== null && <span className="type-label text-text-muted"> · {row.model}</span>}
                </span>
                <span className="type-label text-text-muted">{row.settled}</span>
                <span className="type-data-sm text-right tabular-nums text-text-primary">{row.brier?.toFixed(3)}</span>
              </li>
            ))}
            <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-baseline gap-3 px-2.5 py-1.5">
              <span />
              <span className="type-label text-text-muted">Always saying 50%</span>
              <span />
              <span className="type-data-sm text-right tabular-nums text-text-muted">0.250</span>
            </li>
          </ol>
        </>
      )}
    </Card>
  );
}

/* ---- the seats and the procedure ---- */

function Seats({ data }: { data: DeskResponse }) {
  return (
    <Card title="Who sits at the desk">
      <ul className="flex flex-col divide-y divide-border-subtle">
        {data.seats.map((seat) => (
          <li key={seat.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("type-data-sm", seat.seated ? "text-text-primary" : "text-text-muted")}>
                {seat.title}
                {!seat.votes && <span className="type-label text-text-muted"> · does not vote</span>}
              </span>
              <span className="type-label shrink-0 text-text-muted">
                {seat.lab} · {seat.tier === "free" ? "free tier" : "paid"}
              </span>
            </div>
            <span className="type-label text-text-muted">{seat.seated ? seat.model : "Empty on this deployment"}</span>
            <span className="type-label text-text-secondary">{seat.lens}</span>
          </li>
        ))}
      </ul>
      <details className="border-t border-border-subtle pt-3">
        <summary className="type-label cursor-pointer text-text-secondary hover:text-text-primary">How the desk works</summary>
        <ol className="type-body-sm mt-2 flex list-decimal flex-col gap-1 pl-5 text-text-secondary">
          <li>One fact sheet, built by code from Hyperliquid, for every member. A member that cites a number not on it is flagged and its reasoning withheld.</li>
          <li>The chair gives each member an assignment through its lens, so the work is divided, not repeated.</li>
          <li>Independent views first, in parallel: nobody sees anyone else&apos;s, so nobody anchors on the loudest voice.</li>
          <li>One review round on anonymised views — Member A, Member B — so an argument is weighed on its merits, not its lab.</li>
          <li>The vote is pooled by code, weighted by each seat&apos;s measured accuracy. No model can overrule the arithmetic.</li>
          <li>The chair writes the memo and must give the dissent its strongest form.</li>
          <li>Every forecast is scored when the market settles it, and the scoreboard shows whether the committee beats its best member.</li>
        </ol>
      </details>
    </Card>
  );
}

export function DeskView() {
  const auth = useElyraAuth();
  const feed = useDesk();
  const [focus, setFocus] = useState<string | null>(null);

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) return <SkeletonRows rows={6} />;
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Users}
        title="Sign in to convene the desk"
        body="A committee of AI models from different labs forecasts one market question together and is scored on it. Words only — it never trades."
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            Sign in
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) return <EmptyState icon={Users} title="The desk is unavailable" body={feed.error ?? "It will try again shortly."} />;
  const shown = data.runs.find((run) => run.id === focus) ?? data.runs[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Card title="Convene the desk" right={<span className="type-label shrink-0 text-text-muted">Never trades</span>}>
        <Convene data={data} feed={feed} onConvened={setFocus} />
      </Card>
      {shown !== null && <RunCard key={shown.id} run={shown} data={data} />}
      {data.runs.length > 1 && (
        <Card title="Earlier sessions">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setFocus(run.id)}
                  aria-current={run.id === shown?.id ? "true" : undefined}
                  className={cn("flex w-full items-baseline justify-between gap-2 py-1.5 text-left", run.id === shown?.id ? "text-text-primary" : "text-text-secondary hover:text-text-primary")}
                >
                  <span className="type-data-sm min-w-0 truncate">
                    {marketLabel(run.market)} · {HORIZONS.find((entry) => entry.id === run.horizon)?.label}
                  </span>
                  <span className="type-label shrink-0 text-text-muted">
                    {run.pFinal === null ? (run.stage === "failed" ? "Stopped" : "In session") : `${run.pFinal}%`}
                    {run.status === "up" ? " · higher" : run.status === "down" ? " · not higher" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Scoreboard data={data} />
      <Seats data={data} />
    </div>
  );
}
