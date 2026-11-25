"use client";

import { useState } from "react";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { Card, Label, Problem, field } from "@/components/arena/parts";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { MIN_RATED } from "@/lib/arena/calls";
import type { ArenaCallView, ArenaResponse } from "@/lib/arena/types";
import type { ArenaFeed } from "@/lib/arena/useArena";
import { formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Calls with receipts: a statement and a probability, append-only, scored by the Brier score. */

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

export function CallsTab({ data, feed, now }: { data: ArenaResponse; feed: ArenaFeed; now: number | null }) {
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
