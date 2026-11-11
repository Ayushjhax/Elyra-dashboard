"use client";

import { useEffect, useState } from "react";
import { Copy, Swords } from "lucide-react";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { PuzzleChart } from "@/components/arena/PuzzleChart";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MIN_RATED } from "@/lib/arena/calls";
import { HIDDEN_BARS } from "@/lib/arena/puzzle";
import { LABEL_TEXT, REVIEW_LABELS, type ReviewLabel } from "@/lib/arena/review";
import type { ArenaCallView, ArenaResponse, PuzzleView, ReviewView } from "@/lib/arena/types";
import { useArena, type ArenaFeed } from "@/lib/arena/useArena";
import { marketFor } from "@/lib/autotrade/rules";
import { useCopy } from "@/lib/clipboard";
import { formatPriceUsd, formatRelativeTime, formatUsd } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Elyra Arena: judgment, not trading volume.

   Everything here is points and paper. The AI only comments — on a trade's
   review, on a settled call — from facts the code computed; it never makes
   the call and never trades. Nothing rewards trading more, larger or with
   more leverage: ratings reward calibration, and the only streak is the
   daily puzzle's.
--------------------------------------------------------------------------- */

const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
);

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="type-label text-text-secondary">
      {children}
    </label>
  );
}

function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="type-h2 text-text-primary">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { state, copy } = useCopy();
  return (
    <Button size="xs" variant="quiet" onClick={() => void copy(text)} aria-label={label}>
      <Copy size={12} aria-hidden />
      {state === "copied" ? "Copied" : "Copy"}
    </Button>
  );
}

const rating = (value: number) => Math.round(value).toLocaleString("en-US");

/* ---- puzzle ---- */

function PuzzleTab({ puzzle, error, feed }: { puzzle: PuzzleView | null; error: string | null; feed: ArenaFeed }) {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [confidence, setConfidence] = useState(60);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (puzzle === null) {
    return <EmptyState icon={Swords} title="No puzzle right now" body={error ?? "Today's chart is being prepared. Try again shortly."} />;
  }
  const answer = puzzle.answer;
  const reveal = puzzle.reveal;
  const vsBot = puzzle.rating - puzzle.bots.momentum;

  return (
    <Card title={`Puzzle #${puzzle.number}`} right={<span className="type-label text-text-muted">{puzzle.date} UTC</span>}>
      <p className="type-body-sm text-text-secondary">
        A real chart, market and date hidden, prices rebased to 100. Will it be higher or lower {HIDDEN_BARS} hours after the last bar?
      </p>
      <PuzzleChart visible={puzzle.visible} reveal={reveal?.bars ?? null} />
      {reveal === null && <p className="type-label text-text-muted">The shaded region is the next {HIDDEN_BARS} hours, hidden until you answer.</p>}

      {answer === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (direction === null) {
              setProblem("Choose up or down.");
              return;
            }
            setBusy(true);
            void feed
              .write("/api/arena/puzzle", "POST", { direction, confidence })
              .then((result) => setProblem(result.error))
              .finally(() => setBusy(false));
          }}
        >
          <div className="flex gap-2" role="group" aria-label="Direction">
            {(["up", "down"] as const).map((option) => (
              <Button key={option} type="button" size="sm" variant={direction === option ? "accent" : "quiet"} aria-pressed={direction === option} onClick={() => setDirection(option)}>
                {option === "up" ? "Higher" : "Lower"}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="puzzle-confidence">Confidence: {confidence}%</Label>
            <input
              id="puzzle-confidence"
              type="range"
              min={50}
              max={99}
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <p className="type-label text-text-muted">
              50% never moves your rating. High confidence gains a little when right and costs a lot when wrong.
            </p>
          </div>
          <div>
            <Button type="submit" size="sm" variant="accent" disabled={busy}>
              Lock in
            </Button>
          </div>
          <Problem text={problem} />
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className={cn("type-h2", answer.correct ? "text-positive" : "text-negative")}>
            {answer.correct ? "Correct" : "Wrong"} — {reveal?.outcome === "up" ? "it rose" : "it fell"} {Math.abs(reveal?.changePct ?? 0).toFixed(2)}%
          </p>
          {reveal !== null && (
            <p className="type-body-sm text-text-secondary">
              It was {marketFor(reveal.market)?.label ?? reveal.market}, to {new Date(reveal.endsAt).toISOString().slice(0, 16).replace("T", " ")} UTC.
            </p>
          )}
          <p className="type-data text-text-primary">
            Rating {rating(answer.ratingBefore)} → {rating(answer.ratingAfter)}
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
            <span className="type-data-sm min-w-0 flex-1 text-text-primary">{answer.share}</span>
            <CopyButton text={answer.share} label="Copy your result" />
          </div>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Rating", rating(puzzle.rating)],
          ["Streak", `${puzzle.streak} ${puzzle.streak === 1 ? "day" : "days"}`],
          ["Played", String(puzzle.played)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-control border border-border-subtle bg-surface-base px-2.5 py-2">
            <dt className="type-label text-text-muted">{label}</dt>
            <dd className="type-data text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        <h3 className="type-eyebrow text-text-muted">Beat the bot</h3>
        <p className="type-body-sm text-text-secondary">
          Coin-flip bot {rating(puzzle.bots.coinFlip)} · Momentum bot {rating(puzzle.bots.momentum)}
          {puzzle.bots.momentumToday !== null && (
            <> (today it said {puzzle.bots.momentumToday.direction === "up" ? "higher" : "lower"} at {puzzle.bots.momentumToday.confidence}%)</>
          )}
        </p>
        <p className="type-label text-text-muted">
          {puzzle.played === 0
            ? "Play to get a rating to compare."
            : vsBot >= 0
              ? `You are ${rating(vsBot)} ahead of the momentum bot.`
              : `The momentum bot is ${rating(-vsBot)} ahead of you.`}
        </p>
      </div>
    </Card>
  );
}

/* ---- calls ---- */

const HORIZONS = [
  { label: "In 1 hour", ms: 60 * 60_000 + 60_000 },
  { label: "In 4 hours", ms: 4 * 3_600_000 },
  { label: "In 1 day", ms: 86_400_000 },
  { label: "In 3 days", ms: 3 * 86_400_000 },
  { label: "In 1 week", ms: 7 * 86_400_000 },
  { label: "In 30 days", ms: 30 * 86_400_000 - 60_000 },
];

const STATUS_TEXT = { open: "Open", hit: "Hit", miss: "Missed", void: "Void" } as const;

function CallRow({ call, feed, now }: { call: ArenaCallView; feed: ArenaFeed; now: number | null }) {
  const [points, setPoints] = useState("10");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canBack = !call.mine && call.status === "open" && call.myBacking === null && now !== null && Date.parse(call.resolvesAt) - now > 3_600_000;
  const back = (stance: "tail" | "fade") => {
    setBusy(true);
    void feed
      .write(`/api/arena/calls/${call.id}/back`, "POST", { stance, points: Number(points) })
      .then((result) => setProblem(result.error))
      .finally(() => setBusy(false));
  };
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <span className="type-data-sm min-w-0 text-text-primary">{call.statement}</span>
        <span className={cn("type-label shrink-0", call.status === "hit" ? "text-positive" : call.status === "miss" ? "text-negative" : "text-text-muted")}>
          {STATUS_TEXT[call.status]}
        </span>
      </div>
      <span className="type-label text-text-muted">
        {call.mine ? "You" : (call.author ?? "A group member")} · {call.visibility === "private" ? "private" : call.visibility === "groups" ? "your groups" : "public"}
        {now !== null && <> · posted {formatRelativeTime(call.createdAt, now)}</>} · {call.tails} tail, {call.fades} fade
      </span>
      {call.settledPrice !== null && (
        <span className="type-label text-text-muted">
          Settled at {formatPriceUsd(call.settledPrice)} ({call.settledSource}) · Brier {call.brier?.toFixed(2)}
        </span>
      )}
      {call.card !== null && <p className="type-body-sm text-text-secondary">{call.card}</p>}
      <span className="type-label flex items-center gap-1.5 text-text-muted" title={call.receipt}>
        Receipt <span className="type-mono-addr">{call.receipt.slice(0, 16)}…</span>
        <InfoTip text="SHA-256 of the call's exact words and the time the server received it. It cannot be changed after posting; anyone can recompute it." />
      </span>
      {call.myBacking !== null && (
        <span className="type-label text-text-secondary">
          You {call.myBacking.stance === "tail" ? "tailed" : "faded"} with {call.myBacking.points} points
          {call.myBacking.settledPoints !== null && <> · {call.myBacking.settledPoints >= 0 ? "+" : ""}{call.myBacking.settledPoints}</>}
        </span>
      )}
      {canBack && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Points to back with" inputMode="numeric" className={cn(field, "w-20")} value={points} onChange={(event) => setPoints(event.target.value)} />
          <Button size="xs" variant="quiet" disabled={busy} onClick={() => back("tail")}>
            Tail
          </Button>
          <Button size="xs" variant="quiet" disabled={busy} onClick={() => back("fade")}>
            Fade
          </Button>
        </div>
      )}
      <Problem text={problem} />
    </li>
  );
}

function NewCall({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  const [form, setForm] = useState({ market: "BTC", direction: "above", price: "", horizon: "2", confidence: "70", visibility: "private" });
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
        const horizon = HORIZONS[Number(form.horizon)] ?? HORIZONS[2];
        void feed
          .write("/api/arena/calls", "POST", {
            market: form.market,
            direction: form.direction,
            price: Number(form.price),
            resolvesAt: new Date(Date.now() + horizon.ms).toISOString(),
            confidence: Number(form.confidence),
            visibility: form.visibility,
          })
          .then((result) => {
            setProblem(result.error);
            if (result.error === null) setForm((current) => ({ ...current, price: "" }));
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-market">Market</Label>
          <select id="call-market" className={field} value={form.market} onChange={set("market")}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-direction">Closes</Label>
          <select id="call-direction" className={field} value={form.direction} onChange={set("direction")}>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-price">Price ($)</Label>
          <input id="call-price" inputMode="decimal" className={field} value={form.price} onChange={set("price")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-horizon">Resolves</Label>
          <select id="call-horizon" className={field} value={form.horizon} onChange={set("horizon")}>
            {HORIZONS.map((option, index) => (
              <option key={option.label} value={String(index)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-confidence">Confidence (50–99%)</Label>
          <input id="call-confidence" inputMode="numeric" className={field} value={form.confidence} onChange={set("confidence")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-visibility">Who sees it</Label>
          <select id="call-visibility" className={field} value={form.visibility} onChange={set("visibility")}>
            <option value="private">Only me</option>
            <option value="groups">My groups</option>
            <option value="public" disabled={!data.profile.public}>
              {data.profile.public ? "Public" : "Public — set a handle first"}
            </option>
          </select>
        </div>
      </div>
      <p className="type-label text-text-muted">
        Once posted, a call cannot be edited or deleted. It settles at Hyperliquid&apos;s one-minute close for that minute.
      </p>
      <div>
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          Post call
        </Button>
      </div>
      <Problem text={problem} />
    </form>
  );
}

function CallsTab({ data, feed, now }: { data: ArenaResponse; feed: ArenaFeed; now: number | null }) {
  const { calibration, points } = data;
  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Your calibration"
        right={<InfoTip text="The Brier score is the average of (confidence − outcome)². 0 is perfect; always saying 50% scores 0.25. Lower is better." />}
      >
        <p className="type-data text-text-primary">
          {calibration.brier === null ? "No settled calls yet" : `Brier ${calibration.brier.toFixed(3)} over ${calibration.settled} calls`}
        </p>
        <p className="type-label text-text-muted">
          {calibration.rated
            ? `${calibration.hits} of ${calibration.settled} hit.`
            : `Ranks after ${MIN_RATED} settled calls — ${calibration.settled} so far.`}
        </p>
        <ul className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
          {calibration.buckets.map((bucket) => (
            <li key={bucket.label} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 px-2.5 py-1.5">
              <span className="type-data-sm text-text-primary">Said {bucket.label}</span>
              <span className="type-label text-text-muted">
                {bucket.calls} {bucket.calls === 1 ? "call" : "calls"}
              </span>
              <span className="type-data-sm text-text-secondary">{bucket.hitPct === null ? "—" : `hit ${bucket.hitPct.toFixed(0)}%`}</span>
            </li>
          ))}
        </ul>
        <p className="type-label text-text-muted">
          Points this week: {points.spent} of {points.budget} used · net from settled backings {points.seasonNet >= 0 ? "+" : ""}
          {points.seasonNet}. Points are a scoreboard; they cannot be bought or cashed out.
        </p>
      </Card>
      <Card title="New call">
        <NewCall data={data} feed={feed} />
      </Card>
      <Card title="Your calls">
        {data.myCalls.length === 0 ? (
          <p className="type-body-sm text-text-secondary">No calls yet. Post one above — the receipt keeps you honest.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.myCalls.map((call) => (
              <CallRow key={call.id} call={call} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </Card>
      <Card title="From your groups and public">
        {data.feed.length === 0 ? (
          <p className="type-body-sm text-text-secondary">Nothing shared with you yet. Join a group in Groups to see friends&apos; calls.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.feed.map((call) => (
              <CallRow key={call.id} call={call} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---- reviews ---- */

const LABEL_TONE: Record<ReviewLabel, string> = {
  brilliant: "border-positive/50 text-positive",
  great: "border-positive/40 text-positive",
  good: "border-border-strong text-text-primary",
  inaccuracy: "border-caution/50 text-caution",
  mistake: "border-negative/40 text-negative",
  blunder: "border-negative/60 text-negative",
};

function ReviewRow({ review, highlighted }: { review: ReviewView; highlighted: boolean }) {
  const { facts } = review;
  return (
    <li id={`review-${review.positionId}`} className={cn("flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0", highlighted && "rounded-card bg-surface-hover px-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="type-data-sm text-text-primary">
          {facts.coin} {facts.side} · {facts.mode}
        </span>
        <span className={cn("type-label rounded-chip border px-1.5", LABEL_TONE[review.label])}>{LABEL_TEXT[review.label]}</span>
      </div>
      <p className="type-body-sm text-text-secondary">{review.coaching}</p>
      <span className="type-label text-text-muted">
        In {formatPriceUsd(facts.entryPrice)} · out {formatPriceUsd(facts.exitPrice)} · {formatUsd(facts.pnlUsd, { sign: true })}
        {facts.rMultiple !== null && <> ({facts.rMultiple.toFixed(1)}R)</>}
        {facts.capture !== null && facts.pnlUsd > 0 && <> · kept {Math.round(facts.capture * 100)}% of the best move</>}
      </span>
    </li>
  );
}

function ReviewsTab({ data, trade }: { data: ArenaResponse; trade: string | null }) {
  const total = REVIEW_LABELS.reduce((sum, label) => sum + data.labelCounts[label], 0);
  const wanted = trade === null ? null : (data.reviews.find((review) => review.positionId === trade) ?? null);
  useEffect(() => {
    if (wanted !== null) document.getElementById(`review-${wanted.positionId}`)?.scrollIntoView({ block: "center" });
  }, [wanted]);
  return (
    <div className="flex flex-col gap-3">
      <Card title="How your trades are played" right={<InfoTip text="Each closed trade is judged against its own plan: a loss taken at the planned stop is Good; a winner given back is not. The label is computed, never written by the AI." />}>
        {total === 0 ? (
          <p className="type-body-sm text-text-secondary">No reviews yet. Every closed trade, paper or live, is reviewed within a few minutes.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {REVIEW_LABELS.map((label) => (
              <li key={label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2">
                <span className="type-label text-text-secondary">{LABEL_TEXT[label]}</span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-surface-hover">
                  <span className="block h-full rounded-pill bg-accent-quiet" style={{ width: `${(data.labelCounts[label] / total) * 100}%` }} />
                </span>
                <span className="type-data-sm text-right text-text-primary">{data.labelCounts[label]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {trade !== null && wanted === null && (
        <p className="type-label text-text-muted">That trade&apos;s review is not written yet — it appears within a few minutes of the trade closing.</p>
      )}
      {data.reviews.length > 0 && (
        <Card title="Reviews">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.reviews.map((review) => (
              <ReviewRow key={review.id} review={review} highlighted={review.positionId === trade} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ---- groups ---- */

function GroupsTab({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  const [handle, setHandle] = useState(data.profile.handle ?? "");
  const [isPublic, setPublic] = useState(data.profile.public);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const run = (url: string, body: Record<string, unknown>, done?: () => void) =>
    void feed.write(url, "POST", body).then((result) => {
      setProblem(result.error);
      if (result.error === null) done?.();
    });
  return (
    <div className="flex flex-col gap-3">
      <Card title="Your Arena profile">
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-handle">Handle</Label>
          <input id="arena-handle" className={field} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="3–20 letters, numbers or _" />
        </div>
        <label className="type-body-sm flex items-center gap-2 text-text-secondary">
          <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={isPublic} onChange={(event) => setPublic(event.target.checked)} />
          Public — show my public calls to everyone under this handle
        </label>
        <p className="type-label text-text-muted">Others only ever see your handle, never your wallet. Calls stay private unless you share each one.</p>
        <div>
          <Button size="sm" variant="quiet" onClick={() => run("/api/arena/profile", { handle, public: isPublic })}>
            Save profile
          </Button>
        </div>
      </Card>
      <Card title="Groups">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run("/api/arena/groups", { action: "create", name }, () => setName(""));
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="group-name">New group</Label>
            <input id="group-name" className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
          </div>
          <Button type="submit" size="sm" variant="quiet">
            Create
          </Button>
        </form>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run("/api/arena/groups", { action: "join", code }, () => setCode(""));
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="group-code">Join with a code</Label>
            <input id="group-code" className={field} value={code} onChange={(event) => setCode(event.target.value)} placeholder="8 letters" />
          </div>
          <Button type="submit" size="sm" variant="quiet">
            Join
          </Button>
        </form>
        {data.groups.length === 0 ? (
          <p className="type-body-sm text-text-secondary">No groups yet. Create one and send its code to friends.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.groups.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="type-data-sm text-text-primary">
                  {group.name} <span className="type-label text-text-muted">· {group.members} {group.members === 1 ? "member" : "members"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="type-mono-addr text-text-secondary">{group.inviteCode}</span>
                  <CopyButton text={group.inviteCode} label={`Copy the invite code for ${group.name}`} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Problem text={problem} />
    </div>
  );
}

const TABS = ["puzzle", "calls", "reviews", "groups"] as const;
type Tab = (typeof TABS)[number];

export function ArenaView({ initialTab, trade }: { initialTab: string | null; trade: string | null }) {
  const auth = useElyraAuth();
  const feed = useArena();
  const now = useMinute();
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initialTab ?? "") ? (initialTab as Tab) : "puzzle");

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) return <SkeletonRows rows={6} />;
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Swords}
        title="Sign in to play"
        body="A daily chart puzzle, calls with receipts and a review of every trade — scored on judgment, not on how much you trade."
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            Sign in
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) return <EmptyState icon={Swords} title="Arena is unavailable" body={feed.error ?? "It will try again shortly."} />;

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-3">
      <TabsList aria-label="Arena">
        {TABS.map((value) => (
          <TabsTrigger key={value} value={value}>
            {value === "puzzle" ? "Puzzle" : value === "calls" ? "Calls" : value === "reviews" ? "Reviews" : "Groups"}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="puzzle">
        <PuzzleTab puzzle={data.puzzle} error={data.puzzleError} feed={feed} />
      </TabsContent>
      <TabsContent value="calls">
        <CallsTab data={data} feed={feed} now={now} />
      </TabsContent>
      <TabsContent value="reviews">
        <ReviewsTab data={data} trade={trade} />
      </TabsContent>
      <TabsContent value="groups">
        <GroupsTab data={data} feed={feed} />
      </TabsContent>
    </Tabs>
  );
}
