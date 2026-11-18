"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Download, Gauge, History, Landmark, LineChart, NotebookPen, Power, ScrollText, Wallet } from "lucide-react";
import { CharterFields, charterBody, draftOf, type CharterDraft } from "@/components/funds/CharterFields";
import { CopyBlock, managerPrompt, useOrigin } from "@/components/funds/ManagerBrief";
import { NavChart } from "@/components/funds/NavChart";
import { field, FundStatusTag, Meter, ModeTag, Notice, plainPct, Problem, Stat } from "@/components/funds/parts";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button, buttonVariants } from "@/components/ui/Button";
import { DeltaText, ValueTone } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import { marketFor } from "@/lib/autotrade/rules";
import { formatPriceUsd, formatRelativeTime, formatTimestamp, formatUsd } from "@/lib/format";
import { FUND_LIMITS } from "@/lib/funds/policy";
import type { FundDetail, FundEventView, FundManagerOption } from "@/lib/funds/types";
import { useFund, useFunds, type FundsFeed } from "@/lib/funds/useFunds";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   One AI fund: its book marked to market now, its record, what its risk
   limits leave room for, its positions, its manager and the manager's
   journal, its capital, its charter, where it is in its life, and the
   sealed record of every event.

   The manager's journal is the agent's own text: shown as text, labelled
   as the agent's, never acted on.
--------------------------------------------------------------------------- */

type Feed = FundsFeed<FundDetail>;

const signedUsd = (value: number) => formatUsd(value, { sign: true });

/* ---- the header ---- */

function Header({ data, now }: { data: FundDetail; now: number | null }) {
  const { summary, book } = data;
  return (
    <DrawerCard icon={Landmark} title={summary.name} right={<FundStatusTag status={summary.status} closedReason={summary.closedReason} />}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="type-label text-text-muted">Net asset value</span>
            <span className="type-price text-text-primary">{summary.navUsd === null ? "—" : formatUsd(summary.navUsd)}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="type-label text-text-muted">Since launch, per unit</span>
            {summary.returnPct !== null && <DeltaText value={summary.returnPct} className="type-data" />}
          </div>
        </div>
        <p className="type-label flex flex-wrap items-center gap-x-2 gap-y-1 text-text-muted">
          <ModeTag mode={summary.mode} />
          <span>
            {book.units.toLocaleString("en-US", { maximumFractionDigits: 4 })} units at {book.npu.toFixed(2)}
          </span>
          {now !== null && <span>launched {formatRelativeTime(summary.createdAt, now)}</span>}
          {book.stale && <span className="text-caution">a position has no live price; marked at its entry</span>}
        </p>
        {summary.status === "halted" && summary.haltReason !== null && (
          <p className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
            Halted by Elyra. {summary.haltReason} Every position was closed. It opens nothing until you resume it.
          </p>
        )}
        {data.successorId !== null && (
          <Link href={`/funds/${data.successorId}`} className={cn(buttonVariants({ variant: "quiet", size: "sm" }), "self-start")}>
            Graduated — open the live fund
          </Link>
        )}
        {data.predecessorId !== null && (
          <Link href={`/funds/${data.predecessorId}`} className="type-label self-start text-text-secondary underline decoration-border-strong underline-offset-4 hover:text-text-primary">
            Incubated on paper first — see that record
          </Link>
        )}
      </div>
    </DrawerCard>
  );
}

/* ---- the record ---- */

function Performance({ data }: { data: FundDetail }) {
  const stats = data.finalReport ?? data.stats;
  return (
    <DrawerCard icon={LineChart} title="NAV per unit">
      <div className="flex flex-col gap-4">
        <NavChart marks={data.marks} />
        <div className="grid grid-cols-4 gap-2 @max-[460px]:grid-cols-2">
          <Stat label="Return">
            <DeltaText value={stats.returnPct} />
          </Stat>
          <Stat label="Max drawdown">{plainPct(stats.maxDrawdownPct)}</Stat>
          <Stat label="Sharpe">{stats.sharpe === null ? "—" : stats.sharpe.toFixed(2)}</Stat>
          <Stat label="Volatility">{plainPct(stats.volatilityPct, 1)}</Stat>
          <Stat label="Days">{String(stats.days)}</Stat>
          <Stat label="Closed trades">{String(stats.trades)}</Stat>
          <Stat label="Win rate">{stats.winRate === null ? "—" : plainPct(stats.winRate * 100, 0)}</Stat>
          <Stat label="Profit factor">{stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)}</Stat>
        </div>
        <p className="type-label text-text-muted">
          Per unit, so capital you add or take out never counts as return. Sharpe and volatility are annualised from daily closes and appear after five days.
          {data.summary.mode === "paper" && " Paper fills pay Hyperliquid's taker fee and slippage."}
        </p>
      </div>
    </DrawerCard>
  );
}

/* ---- risk ---- */

function Risk({ data }: { data: FundDetail }) {
  const { charter, risk, book } = data;
  if (data.summary.status === "closed") return null;
  return (
    <DrawerCard icon={Gauge} title="Risk">
      <div className="flex flex-col gap-3">
        <Meter label="Drawdown from the high" used={risk.drawdownPct} limit={charter.maxDrawdownPct} value={plainPct(risk.drawdownPct)} of={`halt at ${charter.maxDrawdownPct}%`} />
        <Meter label="Today" used={Math.max(0, -risk.todayPct)} limit={charter.dailyLossPct} value={plainPct(risk.todayPct)} of={`stop at -${charter.dailyLossPct}%`} />
        <Meter label="Gross exposure" used={risk.grossExposure} limit={charter.maxGrossExposure} value={`${risk.grossExposure.toFixed(2)}×`} of={`${charter.maxGrossExposure}× NAV`} />
        <Meter label="Open positions" used={book.openPositions} limit={charter.maxPositions} value={String(book.openPositions)} of={String(charter.maxPositions)} />
        {risk.blockers.length === 0 ? (
          <p className="type-label text-text-secondary">
            The manager may open a position of up to <span className="type-data-sm text-text-primary">{formatUsd(risk.maxNewPositionUsd)}</span> now.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {risk.blockers.map((blocker) => (
              <li key={blocker} className="type-label text-caution">
                {blocker}
              </li>
            ))}
          </ul>
        )}
        <p className="type-label text-text-muted">Your account-wide limits on the Automation page apply to the fund too.</p>
      </div>
    </DrawerCard>
  );
}

/* ---- positions and trades ---- */

function Positions({ data, feed, id }: { data: FundDetail; feed: Feed; id: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (data.summary.status === "closed" && data.positions.length === 0) return null;
  const close = async (positionId: string) => {
    setBusy(positionId);
    setError(null);
    const result = await feed.write(`/api/funds/${id}/positions/${positionId}`, "DELETE");
    setBusy(null);
    setError(result.error);
  };
  return (
    <DrawerCard icon={Wallet} title="Positions" right={<span className="type-data-sm text-text-muted">{data.positions.length}</span>}>
      {data.positions.length === 0 ? (
        <p className="type-body-sm text-text-secondary">Flat. Positions the manager opens appear here with their take-profit and stop-loss.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {data.positions.map((position) => (
            <li key={position.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="type-body-sm min-w-0 truncate text-text-primary">
                  {position.label} <span className="text-text-muted">{position.side} · {position.leverage}x</span>
                </span>
                <ValueTone value={position.unrealisedUsd} className="type-data-sm shrink-0">
                  {signedUsd(position.unrealisedUsd)}
                </ValueTone>
              </div>
              <span className="type-label text-text-muted">
                {formatUsd(position.notionalUsd)} · entry {formatPriceUsd(position.entryPrice)} · now {formatPriceUsd(position.mark)} · TP {formatPriceUsd(position.takeProfit)} · SL{" "}
                {formatPriceUsd(position.stopLoss)}
              </span>
              <div>
                <Button size="xs" variant="quiet" disabled={busy !== null || position.status !== "open"} onClick={() => void close(position.id)}>
                  {busy === position.id ? "Closing" : position.status === "opening" ? "Confirming entry" : "Close now"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Problem text={error} />
    </DrawerCard>
  );
}

function Trades({ data }: { data: FundDetail }) {
  if (data.trades.length === 0) return null;
  return (
    <DrawerCard icon={History} title="Closed trades">
      <ul className="flex flex-col divide-y divide-border-subtle">
        {data.trades.slice(0, 25).map((trade) => (
          <li key={trade.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="type-data-sm min-w-0 truncate text-text-primary">
                {trade.label} {trade.side} · {formatPriceUsd(trade.entryPrice)} → {formatPriceUsd(trade.exitPrice)}
              </span>
              <ValueTone value={trade.realisedUsd} className="type-data-sm shrink-0">
                {signedUsd(trade.realisedUsd)}
              </ValueTone>
            </div>
            <span className="type-label text-text-muted">
              {trade.exitReason} · {formatTimestamp(trade.closedAt)}
            </span>
          </li>
        ))}
      </ul>
    </DrawerCard>
  );
}

/* ---- the manager ---- */

function Manager({ data, feed, id, managers, now }: { data: FundDetail; feed: Feed; id: string; managers: FundManagerOption[]; now: number | null }) {
  const origin = useOrigin();
  const current = data.summary.manager;
  const choices = managers.filter((manager) => manager.managing === null || manager.managing === id);
  const [choice, setChoice] = useState(current?.keyId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = data.summary.status === "closed";

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await feed.write(`/api/funds/${id}`, "POST", { op: "manager", keyId: choice === "" ? null : choice });
    setBusy(false);
    setError(result.error);
  };

  return (
    <DrawerCard icon={Bot} title="Manager">
      <div className="flex flex-col gap-3">
        {current === null ? (
          <p className="type-body-sm text-text-secondary">No manager. Nothing trades until an agent key is assigned.</p>
        ) : (
          <p className="type-body-sm text-text-primary">
            {current.name} <span className="type-mono-addr text-text-muted">{current.prefix}…</span>
            <span className="type-label block text-text-muted">
              {data.summary.managerSeenAt === null || now === null ? "Has not checked in yet." : `Last checked in ${formatRelativeTime(data.summary.managerSeenAt, now)}.`}
            </span>
          </p>
        )}
        {!closed && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select className={cn(field, "w-auto min-w-48 flex-1")} value={choice} onChange={(event) => setChoice(event.target.value)} aria-label="Manager key">
                <option value="">No manager</option>
                {choices.map((manager) => (
                  <option key={manager.keyId} value={manager.keyId}>
                    {manager.name} · {manager.prefix}…
                  </option>
                ))}
              </select>
              <Button size="sm" variant="quiet" disabled={busy || choice === (current?.keyId ?? "")} onClick={() => void save()}>
                {busy ? "Saving" : "Change manager"}
              </Button>
            </div>
            <p className="type-label text-text-muted">
              The agent connects to <span className="type-mono-addr text-text-secondary">{origin}/api/mcp</span> with its key and sees this fund&apos;s four tools.
              Keys are made and revoked in{" "}
              <Link href="/agent" className="underline decoration-border-strong underline-offset-4 hover:text-text-primary">
                Connections
              </Link>
              .
            </p>
            <p className="type-label text-text-secondary">Standing instructions for the agent</p>
            <CopyBlock text={managerPrompt(data.summary.name)} label="Copy the manager's instructions" />
          </>
        )}
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}

function Journal({ data }: { data: FundDetail }) {
  return (
    <DrawerCard icon={NotebookPen} title="Manager's journal">
      {data.notes.length === 0 ? (
        <p className="type-body-sm text-text-secondary">Nothing yet. The manager&apos;s reasons for each trade and its notes appear here, in its own words.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.notes.slice(0, 20).map((note) => (
            <li key={note.id} className="rounded-card border border-border-subtle bg-surface-base px-3 py-2">
              <p className="type-label mb-1 text-text-muted">
                {note.author} wrote{note.positionId !== null ? " about a trade" : ""} · {formatTimestamp(note.at)}
              </p>
              <p className="type-body-sm whitespace-pre-wrap break-words text-text-secondary">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </DrawerCard>
  );
}

/* ---- capital ---- */

function Capital({ data, feed, id }: { data: FundDetail; feed: Feed; id: string }) {
  const [direction, setDirection] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = data.summary.status === "active" || data.summary.status === "paused" || data.summary.status === "halted";
  const { book } = data;

  const move = async () => {
    setBusy(true);
    setError(null);
    const result = await feed.write(`/api/funds/${id}`, "POST", { op: "capital", direction, amountUsd: amount });
    setBusy(false);
    if (result.error !== null) setError(result.error);
    else setAmount("");
  };

  return (
    <DrawerCard icon={Wallet} title="Capital">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 @max-[420px]:grid-cols-1">
          <Stat label="Put in">{formatUsd(book.contributedUsd)}</Stat>
          <Stat label="Taken out">{formatUsd(book.withdrawnUsd)}</Stat>
          <Stat label="Realised">
            <ValueTone value={book.realisedUsd}>{signedUsd(book.realisedUsd)}</ValueTone>
          </Stat>
        </div>
        <p className="type-label text-text-muted">
          {data.summary.mode === "live"
            ? "A live fund's capital is an allocation of your own Hyperliquid account. Nothing moves: adding claims more of the account for the fund, withdrawing gives it back. Elyra's key there cannot withdraw."
            : "Paper capital. Adding or withdrawing buys or redeems units at today's NAV per unit, so the fund's return is unchanged."}
        </p>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <select className={cn(field, "w-auto")} value={direction} onChange={(event) => setDirection(event.target.value === "withdraw" ? "withdraw" : "add")} aria-label="Add or withdraw">
              <option value="add">Add</option>
              <option value="withdraw">Withdraw</option>
            </select>
            <input inputMode="decimal" className={cn(field, "w-32 flex-1")} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="USD" aria-label="Amount in USD" />
            <Button size="sm" variant="quiet" disabled={busy || amount.trim().length === 0} onClick={() => void move()}>
              {busy ? "Saving" : direction === "add" ? "Add capital" : "Withdraw"}
            </Button>
          </div>
        )}
        <Problem text={error} />
        {data.flows.length > 0 && (
          <ul className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle pt-2">
            {data.flows.map((flow) => (
              <li key={flow.id} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="type-label text-text-secondary">
                  {flow.kind === "subscribe" ? "In" : "Out"} · {flow.units.toLocaleString("en-US", { maximumFractionDigits: 4 })} units at {flow.npu.toFixed(2)} · {formatTimestamp(flow.at)}
                </span>
                <span className="type-data-sm shrink-0 text-text-primary">{formatUsd(flow.kind === "subscribe" ? flow.amountUsd : -flow.amountUsd, { sign: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DrawerCard>
  );
}

/* ---- the charter ---- */

function Charter({ data, feed, id }: { data: FundDetail; feed: Feed; id: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharterDraft>(() => draftOf(data.charter));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { charter } = data;
  const editable = data.summary.status === "active" || data.summary.status === "paused" || data.summary.status === "halted";

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await feed.write(`/api/funds/${id}`, "PATCH", charterBody(draft));
    setBusy(false);
    if (result.error !== null) setError(result.error);
    else setEditing(false);
  };

  return (
    <DrawerCard icon={ScrollText} title="Charter">
      {editing ? (
        <div className="flex flex-col gap-4">
          <CharterFields draft={draft} onChange={setDraft} />
          <p className="type-label text-text-muted">A tighter limit stops new positions at once; open ones run to their own exits. The change is in your ledger.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving" : "Save the charter"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <Problem text={error} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="type-body-sm whitespace-pre-wrap break-words text-text-secondary">{charter.objective}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              ["Markets", charter.markets.map((coin) => marketFor(coin)?.label ?? coin).join(", ")],
              ["Shorts", charter.allowShorts ? "Allowed" : "Not allowed"],
              ["Largest position", `${charter.maxPositionPct}% of NAV`],
              ["Gross exposure", `${charter.maxGrossExposure}× NAV`],
              ["Leverage", `up to ${charter.maxLeverage}x`],
              ["Open positions", `up to ${charter.maxPositions}`],
              ["Halt at drawdown", `${charter.maxDrawdownPct}%`],
              ["Daily loss limit", `${charter.dailyLossPct}%`],
            ].map(([term, value]) => (
              <div key={term} className={cn("flex min-w-0 flex-col", term === "Markets" && "col-span-2")}>
                <dt className="type-label text-text-muted">{term}</dt>
                <dd className="type-data-sm min-w-0 break-words text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          {editable && (
            <div>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setDraft(draftOf(data.charter));
                  setEditing(true);
                }}
              >
                Change the charter
              </Button>
            </div>
          )}
        </div>
      )}
    </DrawerCard>
  );
}

/* ---- the lifecycle ---- */

function Lifecycle({ data, feed, id }: { data: FundDetail; feed: Feed; id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [capital, setCapital] = useState("");
  const { actions, graduation } = data;
  if (actions.length === 0) {
    return data.summary.status === "winding_down" ? (
      <DrawerCard icon={Power} title="Winding down">
        <p className="type-body-sm text-text-secondary">Elyra is closing what is left and will close the fund out once it is flat, within five minutes.</p>
      </DrawerCard>
    ) : null;
  }

  const act = async (op: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await feed.write(`/api/funds/${id}`, "POST", { op, ...extra });
    setBusy(false);
    setConfirming(false);
    if (result.error !== null) return setError(result.error);
    const notes = (result.body.notes as string[] | undefined) ?? [];
    setNotice(notes.length > 0 ? notes.join(" ") : null);
  };

  return (
    <DrawerCard icon={Power} title="Lifecycle">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {actions.includes("pause") && (
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => void act("pause")}>
              Pause
            </Button>
          )}
          {actions.includes("resume") && (
            <Button size="sm" variant="accent" disabled={busy} onClick={() => void act("resume")}>
              {data.summary.status === "halted" ? "Resume from the halt" : "Resume"}
            </Button>
          )}
          {actions.includes("wind_down") &&
            (confirming ? (
              <>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void act("wind_down")}>
                  Close every position and the fund
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
                Wind down
              </Button>
            ))}
        </div>
        <p className="type-label text-text-muted">
          Pausing stops new positions; open ones keep their exits. Resuming from a halt restarts the drawdown and the day&apos;s loss from today&apos;s NAV. Winding down closes
          everything now and freezes the record.
        </p>

        {actions.includes("graduate") && graduation !== null && (
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
            <p className="type-body-sm font-medium text-text-primary">Graduate to live</p>
            <p className="type-label text-text-secondary">
              The paper fund closes with its record frozen, and a live fund opens with the same charter and manager, trading the capital you allocate from your own
              Hyperliquid account — so a live record never contains paper results.{" "}
              {`${graduation.incubatedDays} ${graduation.incubatedDays === 1 ? "day" : "days"} on paper (${FUND_LIMITS.minIncubationDays} needed) · ${graduation.closedTrades} closed ${graduation.closedTrades === 1 ? "trade" : "trades"} (${FUND_LIMITS.minIncubationTrades} needed).`}
            </p>
            {graduation.ready ? (
              <div className="flex flex-wrap items-center gap-2">
                <input inputMode="decimal" className={cn(field, "w-36 flex-1")} value={capital} onChange={(event) => setCapital(event.target.value)} placeholder="Live capital, USD" aria-label="Live capital in USD" />
                <Button size="sm" variant="accent" disabled={busy || capital.trim().length === 0} onClick={() => void act("graduate", { capitalUsd: capital })}>
                  {busy ? "Graduating" : "Graduate"}
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {graduation.reasons.map((reason) => (
                  <li key={reason} className="type-label text-text-muted">
                    · {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Problem text={error} />
        <Notice text={notice} />
      </div>
    </DrawerCard>
  );
}

/* ---- the sealed record ---- */

const EVENT_WORD: Record<string, string> = {
  "fund.launched": "Launched",
  "fund.charter_changed": "Charter changed",
  "fund.capital_added": "Capital added",
  "fund.capital_withdrawn": "Capital withdrawn",
  "fund.manager_changed": "Manager changed",
  "fund.paused": "Paused",
  "fund.resumed": "Resumed",
  "fund.order_refused": "Order refused by the charter",
  "fund.order_failed": "Order failed",
  "fund.position_opened": "Position opened",
  "fund.position_closed": "Position closed",
  "fund.note": "Journal entry",
  "fund.halted": "Halted at the drawdown limit",
  "fund.winding_down": "Wind-down started",
  "fund.closed": "Closed out",
  "fund.graduated": "Graduated to live",
  "fund.nav": "Day's closing NAV sealed",
};

function eventLine(event: FundEventView): string | null {
  const body = event.body;
  const coin = typeof body.coin === "string" ? (marketFor(body.coin)?.label ?? body.coin) : null;
  switch (event.event) {
    case "fund.position_opened":
      return `${coin} ${String(body.side)} · ${formatUsd(Number(body.sizeUsd))} at ${formatPriceUsd(Number(body.entryPrice))}`;
    case "fund.position_closed":
      return `${coin} · ${body.realisedUsd === null || body.realisedUsd === undefined ? "result pending" : signedUsd(Number(body.realisedUsd))}`;
    case "fund.order_refused":
      return Array.isArray(body.reasons) ? String(body.reasons[0] ?? "") : null;
    case "fund.order_failed":
      return typeof body.error === "string" ? body.error : null;
    case "fund.capital_added":
    case "fund.capital_withdrawn":
      return `${formatUsd(Number(body.amountUsd))} at ${Number(body.npu).toFixed(2)} a unit`;
    case "fund.nav":
      return `${String(body.day)} · ${formatUsd(Number(body.navUsd))} · ${Number(body.npu).toFixed(2)} a unit`;
    case "fund.launched":
      return `${String(body.mode)} · ${formatUsd(Number(body.capitalUsd))}`;
    default:
      return null;
  }
}

function SealedRecord({ data, id }: { data: FundDetail; id: string }) {
  const authedFetch = useAuthedFetch();
  const [error, setError] = useState<string | null>(null);
  const actorName = (actor: string) => (actor === "person" ? "You" : actor === "elyra" ? "Elyra" : actor === `agent:${data.summary.manager?.keyId}` ? data.summary.manager?.name : "An agent");

  const download = async () => {
    setError(null);
    try {
      const response = await authedFetch(`/api/funds/${id}/statement`);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `elyra-fund-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The statement could not be exported just now.");
    }
  };

  return (
    <DrawerCard icon={ScrollText} title="Sealed record">
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          Every event in this fund&apos;s life — orders taken and refused, closes, capital, charter changes, each day&apos;s closing NAV — in your hash-chained
          ledger, where it cannot be rewritten.
        </p>
        {data.events.length > 0 && (
          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
            {data.events.slice(0, 20).map((event) => {
              const line = eventLine(event);
              return (
                <li key={event.seq} className="flex flex-col gap-0.5 px-2.5 py-1.5">
                  <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2">
                    <span className="type-data-sm text-text-muted">#{event.seq}</span>
                    <span className="type-data-sm min-w-0 truncate text-text-primary">
                      {EVENT_WORD[event.event] ?? event.event}
                      <span className="text-text-muted"> · {actorName(event.actor)}</span>
                    </span>
                    <span className="type-mono-addr shrink-0 text-text-muted">{event.hash.slice(0, 8)}</span>
                  </div>
                  {line !== null && <span className="type-label min-w-0 truncate pl-7 text-text-secondary">{line}</span>}
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="quiet" onClick={() => void download()}>
            <Download size={14} aria-hidden /> Statement CSV
          </Button>
          <Link href="/agents" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Whole ledger
          </Link>
        </div>
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}

export function FundView({ id }: { id: string }) {
  const auth = useElyraAuth();
  const feed = useFund(id);
  const list = useFunds();
  const now = useMinute();

  const back = (
    <Link href="/funds" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>
      <ArrowLeft size={14} aria-hidden /> All funds
    </Link>
  );

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) {
    return (
      <DrawerCard icon={Landmark} title="Fund">
        <SkeletonRows rows={5} />
      </DrawerCard>
    );
  }
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Landmark}
        title="Sign in to see this fund"
        body="Funds are private to the account that runs them."
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            Sign in
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) {
    return (
      <>
        {back}
        <EmptyState icon={Landmark} title="This fund could not be opened" body={feed.error ?? "It will try again shortly."} />
      </>
    );
  }

  return (
    <>
      {back}
      <Header data={data} now={now} />
      {/* A halted fund's first question is whether to resume it; otherwise the record comes first. */}
      {data.summary.status === "halted" && <Lifecycle data={data} feed={feed} id={id} />}
      <Performance data={data} />
      <Risk data={data} />
      <Positions data={data} feed={feed} id={id} />
      <Manager data={data} feed={feed} id={id} managers={list.data?.managers ?? []} now={now} />
      <Journal data={data} />
      <Trades data={data} />
      <Capital data={data} feed={feed} id={id} />
      {data.summary.status !== "halted" && <Lifecycle data={data} feed={feed} id={id} />}
      <Charter data={data} feed={feed} id={id} />
      <SealedRecord data={data} id={id} />
    </>
  );
}
