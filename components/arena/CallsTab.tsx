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
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/* Calls with receipts: a statement and a probability, append-only, scored by the Brier score. */

const HORIZONS = [
  { label: msg("In 1 hour"), ms: 60 * 60_000 + 60_000 },
  { label: msg("In 4 hours"), ms: 4 * 3_600_000 },
  { label: msg("In 1 day"), ms: 86_400_000 },
  { label: msg("In 3 days"), ms: 3 * 86_400_000 },
  { label: msg("In 1 week"), ms: 7 * 86_400_000 },
  { label: msg("In 30 days"), ms: 30 * 86_400_000 - 60_000 },
];

const STATUS_TEXT = { open: msg("Unsettled"), hit: msg("Hit"), miss: msg("Missed"), void: msg("Void") } as const;

function CallRow({ call, feed, now }: { call: ArenaCallView; feed: ArenaFeed; now: number | null }) {
  const t = useT();
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
          {t(STATUS_TEXT[call.status])}
        </span>
      </div>
      <span className="type-label text-text-muted">
        {call.mine ? t("You") : (call.author ?? t("A group member"))} ·{" "}
        {call.visibility === "private" ? t("private") : call.visibility === "groups" ? t("your groups") : t("public")}
        {now !== null && <> {t("· posted {createdAt}", { createdAt: formatRelativeTime(call.createdAt, now, t.locale) })}</>}{" "}
        {t("· {tails} tail, {fades} fade", { tails: call.tails, fades: call.fades })}
      </span>
      {call.settledPrice !== null && (
        <span className="type-label text-text-muted">
          {t("Settled at {settledPrice} (", { settledPrice: formatPriceUsd(call.settledPrice) })}
          {call.settledSource}
          {t(") · Brier")} {call.brier?.toFixed(2)}
        </span>
      )}
      {call.card !== null && <p className="type-body-sm text-text-secondary">{call.card}</p>}
      <span className="type-label flex items-center gap-1.5 text-text-muted" title={call.receipt}>
        {t("Receipt")} <span className="type-mono-addr">{call.receipt.slice(0, 16)}…</span>
        <InfoTip text={t("SHA-256 of the call's exact words and the time the server received it. It cannot be changed after posting; anyone can recompute it.")} />
      </span>
      {call.myBacking !== null && (
        <span className="type-label text-text-secondary">
          {call.myBacking.stance === "tail"
            ? t("You tailed with {points} points", { points: call.myBacking.points })
            : t("You faded with {points} points", { points: call.myBacking.points })}
          {call.myBacking.settledPoints !== null && <> · {call.myBacking.settledPoints >= 0 ? "+" : ""}{call.myBacking.settledPoints}</>}
        </span>
      )}
      {canBack && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={t("Points to back with")} inputMode="numeric" className={cn(field, "w-20")} value={points} onChange={(event) => setPoints(event.target.value)} />
          <Button size="xs" variant="quiet" disabled={busy} onClick={() => back("tail")}>
            {t("Tail")}
          </Button>
          <Button size="xs" variant="quiet" disabled={busy} onClick={() => back("fade")}>
            {t("Fade")}
          </Button>
        </div>
      )}
      <Problem text={problem} />
    </li>
  );
}

function NewCall({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  const t = useT();
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
          <Label htmlFor="call-market">{t("Market")}</Label>
          <select id="call-market" className={field} value={form.market} onChange={set("market")}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-direction">{t("Closes")}</Label>
          <select id="call-direction" className={field} value={form.direction} onChange={set("direction")}>
            <option value="above">{t("Above")}</option>
            <option value="below">{t("Below")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-price">{t("Price ($)")}</Label>
          <input id="call-price" inputMode="decimal" className={field} value={form.price} onChange={set("price")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-horizon">{t("Resolves")}</Label>
          <select id="call-horizon" className={field} value={form.horizon} onChange={set("horizon")}>
            {HORIZONS.map((option, index) => (
              <option key={option.label} value={String(index)}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-confidence">{t("Confidence (50–99%)")}</Label>
          <input id="call-confidence" inputMode="numeric" className={field} value={form.confidence} onChange={set("confidence")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-visibility">{t("Who sees it")}</Label>
          <select id="call-visibility" className={field} value={form.visibility} onChange={set("visibility")}>
            <option value="private">{t("Only me")}</option>
            <option value="groups">{t("My groups")}</option>
            <option value="public" disabled={!data.profile.public}>
              {data.profile.public ? t("Public") : t("Public — set a handle first")}
            </option>
          </select>
        </div>
      </div>
      <p className="type-label text-text-muted">
        {t("Once posted, a call cannot be edited or deleted. It settles at Hyperliquid's one-minute close for that minute.")}
      </p>
      <div>
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          {t("Post call")}
        </Button>
      </div>
      <Problem text={problem} />
    </form>
  );
}

export function CallsTab({ data, feed, now }: { data: ArenaResponse; feed: ArenaFeed; now: number | null }) {
  const t = useT();
  const { calibration, points } = data;
  return (
    <div className="flex flex-col gap-3">
      <Card
        title={t("Your calibration")}
        right={<InfoTip text={t("The Brier score is the average of (confidence − outcome)². 0 is perfect; always saying 50% scores 0.25. Lower is better.")} />}
      >
        <p className="type-data text-text-primary">
          {calibration.brier === null
            ? t("No settled calls yet")
            : calibration.settled === 1
              ? t("Brier {brier} over 1 call", { brier: calibration.brier.toFixed(3) })
              : t("Brier {brier} over {settled} calls", { brier: calibration.brier.toFixed(3), settled: calibration.settled })}
        </p>
        <p className="type-label text-text-muted">
          {calibration.rated
            ? t("{hits} of {settled} hit.", { hits: calibration.hits, settled: calibration.settled })
            : t("Ranks after {MIN_RATED} settled calls — {settled} so far.", { MIN_RATED, settled: calibration.settled })}
        </p>
        <ul className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
          {calibration.buckets.map((bucket) => (
            <li key={bucket.label} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 px-2.5 py-1.5">
              <span className="type-data-sm text-text-primary">{t("Said {label}", { label: bucket.label })}</span>
              <span className="type-label text-text-muted">
                {bucket.calls} {bucket.calls === 1 ? t("call") : t("calls")}
              </span>
              <span className="type-data-sm text-text-secondary">{bucket.hitPct === null ? "—" : t("hit {hitPct}%", { hitPct: bucket.hitPct.toFixed(0) })}</span>
            </li>
          ))}
        </ul>
        <p className="type-label text-text-muted">
          {t(
            "Points this week: {spent} of {budget} used · net from settled backings {value}{seasonNet}. Points are a scoreboard; they cannot be bought or cashed out.",
            { spent: points.spent, budget: points.budget, value: points.seasonNet >= 0 ? "+" : "", seasonNet: points.seasonNet },
          )}
        </p>
      </Card>
      <Card title={t("New call")}>
        <NewCall data={data} feed={feed} />
      </Card>
      <Card title={t("Your calls")}>
        {data.myCalls.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No calls yet. Post one above — the receipt keeps you honest.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.myCalls.map((call) => (
              <CallRow key={call.id} call={call} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </Card>
      <Card title={t("From your groups and public")}>
        {data.feed.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("Nothing shared with you yet. Join a group under Ladder to see friends' calls.")}</p>
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
