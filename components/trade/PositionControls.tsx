"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CLOSE_FRACTIONS } from "@/lib/autotrade/manage";
import type { TradeView } from "@/lib/autotrade/types";
import { formatPriceUsd, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { refreshPaper } from "@/lib/paper/usePaper";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   One open position, managed by hand: how its entry filled, closing part or
   all of it, and moving its take-profit and stop-loss. Shared by the chart's
   trade panel and the Automation page.

   Every action goes to the position's own route — DELETE ?fraction to
   close (closeTrade, the one close path), PATCH to move the exits
   (moveExits) — and the server holds both to the limits; nothing here
   decides what is allowed. An AI fund's position shows its fill and its
   whole-close only: its size and exits are its manager's.
--------------------------------------------------------------------------- */

export type Write = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;

/**
 * The two actions on a position, through its route. One at a time: a second
 * press while one is in flight is refused before React re-renders. The
 * paper balance is read again after either, so it follows the result.
 */
export function usePositionActions(trade: TradeView, write: Write, onNote?: (note: string | null) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const run = async (key: string, send: () => ReturnType<Write>): Promise<boolean> => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(key);
    setError(null);
    const result = await send();
    pending.current = false;
    setBusy(null);
    if (trade.mode === "paper") refreshPaper();
    if (result.error !== null) {
      setError(result.error);
      return false;
    }
    if (key.startsWith("close:")) onNote?.(typeof result.body.note === "string" ? result.body.note : null);
    return true;
  };

  return {
    busy,
    error,
    close: (fraction: number) => run(`close:${fraction}`, () => write(`/api/automation/positions/${trade.id}?fraction=${fraction}`, "DELETE")),
    move: (takeProfit: number, stopLoss: number) => run("move", () => write(`/api/automation/positions/${trade.id}`, "PATCH", { takeProfit, stopLoss })),
  };
}

type Actions = ReturnType<typeof usePositionActions>;

/** How the entry filled against the price it was sent at. */
export function FillReport({ trade }: { trade: TradeView }) {
  const t = useT();
  if (trade.expectedPrice === null || trade.expectedPrice === undefined || trade.slippageBps === null || trade.slippageBps === undefined) {
    return <p className="type-label text-text-muted">{t("Filled at {price}", { price: formatPriceUsd(trade.entryPrice) })}</p>;
  }
  const bps = trade.slippageBps;
  return (
    <p className="type-label text-text-muted">
      {t("Filled at {price} against {expected} expected", { price: formatPriceUsd(trade.entryPrice), expected: formatPriceUsd(trade.expectedPrice) })}
      {" · "}
      <span className={cn("tabular-nums", bps > 0.5 ? "text-caution" : bps < -0.5 ? "text-positive" : "text-text-secondary")}>
        {bps === 0
          ? t("no slippage")
          : bps > 0
            ? t("{bps} bps worse", { bps: Math.abs(bps).toFixed(1) })
            : t("{bps} bps better", { bps: Math.abs(bps).toFixed(1) })}
      </span>
      {trade.mode === "paper" && <> · {t("paper fills pay the estimated taker fee and slippage")}</>}
    </p>
  );
}

/** What the partial closes have taken so far, and their result. */
export function PartialsNote({ trade }: { trade: TradeView }) {
  const t = useT();
  const partials = trade.partialCloses ?? [];
  if (partials.length === 0) return null;
  const original = trade.originalSize ?? trade.size;
  return (
    <p className="type-label text-text-muted">
      {t("{closed} of {original} closed so far, {pnl} after fees", {
        closed: Number((original - trade.size).toPrecision(6)),
        original: Number(original.toPrecision(6)),
        pnl: formatUsd(trade.realisedPartialUsd ?? 0, { sign: true }),
      })}
    </p>
  );
}

/**
 * The position editor: the take-profit and stop-loss as prices, sent to
 * `moveExits`, which holds them to the right side of a fresh mark and to
 * `LIMITS`. On the ticket it sits on the glass; on Automation, flat.
 */
export function ExitEditor({
  trade,
  actions,
  onDone,
  glass = false,
}: {
  trade: TradeView;
  actions: Actions;
  onDone: () => void;
  glass?: boolean;
}) {
  const t = useT();
  const [takeProfit, setTakeProfit] = useState(String(trade.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(trade.stopLoss));
  const field = glass
    ? "graphite-field type-data h-10 w-full px-3 tabular-nums"
    : "type-data h-8 w-28 rounded-control border border-border-strong bg-surface-base px-2 text-text-primary";
  const save = async () => {
    if (await actions.move(Number(takeProfit), Number(stopLoss))) onDone();
  };
  return (
    <div className={cn("flex flex-wrap items-end gap-2", glass && "grid grid-cols-2 gap-3")}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={cn("type-label", glass ? "text-text-secondary" : "text-text-muted")}>{t("Take-profit ($)")}</span>
        <input autoFocus={glass} inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} className={field} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={cn("type-label", glass ? "text-text-secondary" : "text-text-muted")}>{t("Stop-loss ($)")}</span>
        <input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} className={field} />
      </label>
      {glass ? (
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" aria-disabled={actions.busy !== null || undefined} onClick={onDone} className="graphite-glass-quiet type-label h-9 px-3">
            {t("Cancel")}
          </button>
          <button type="button" aria-disabled={actions.busy !== null || undefined} onClick={() => void save()} className="graphite-outline type-label h-9 px-3 font-semibold">
            {actions.busy === "move" ? t("Saving…") : t("Save exits")}
          </button>
        </div>
      ) : (
        <>
          <Button size="sm" variant="accent" disabled={actions.busy !== null} onClick={() => void save()}>
            {actions.busy === "move" ? t("Saving…") : t("Save exits")}
          </Button>
          <Button size="sm" variant="ghost" disabled={actions.busy !== null} onClick={onDone}>
            {t("Cancel")}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Closing part or all of the position, on the ticket: 25%, 50%, 75% and All,
 * grouped under one label. All is amber — the one control that ends the
 * position — and an AI fund's position offers All only. The server takes a
 * remainder too small to keep whole, and says so (the note).
 */
export function ClosePosition({ trade, actions }: { trade: TradeView; actions: Actions }) {
  const t = useT();
  const heading = `close-${trade.id}`;
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-2.5">
      <h3 id={heading} className="type-h2 text-text-primary">
        {t("Close position")}
      </h3>
      <div role="group" aria-labelledby={heading} className="grid grid-cols-4 gap-2">
        {CLOSE_FRACTIONS.filter((fraction) => fraction === 1 || !trade.fund).map((fraction) => (
          <button
            key={fraction}
            type="button"
            aria-disabled={actions.busy !== null || undefined}
            onClick={() => void actions.close(fraction)}
            aria-label={fraction === 1 ? t("Close all of the position") : t("Close {pct}% of the position", { pct: fraction * 100 })}
            className={cn(
              "type-body h-10 tabular-nums font-medium",
              fraction === 1 ? "graphite-amber col-start-4" : "graphite-outline",
            )}
          >
            {actions.busy === `close:${fraction}` ? "…" : fraction === 1 ? t("All") : `${fraction * 100}%`}
          </button>
        ))}
      </div>
    </section>
  );
}

export function PositionControls({ trade, write, onNote }: { trade: TradeView; write: Write; onNote?: (note: string | null) => void }) {
  const t = useT();
  const actions = usePositionActions(trade, write, onNote);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <FillReport trade={trade} />
      <PartialsNote trade={trade} />

      {editing ? (
        <ExitEditor trade={trade} actions={actions} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {!trade.fund && (
            <Button size="xs" onClick={() => setEditing(true)}>
              {t("Edit TP/SL")}
            </Button>
          )}
          <span className="type-label ml-1 text-text-muted">{t("Close")}</span>
          {CLOSE_FRACTIONS.filter((fraction) => fraction === 1 || !trade.fund).map((fraction) => (
            <Button
              key={fraction}
              size="xs"
              variant={fraction === 1 ? "danger" : "quiet"}
              disabled={actions.busy !== null}
              onClick={() => void actions.close(fraction)}
              aria-label={fraction === 1 ? t("Close all of the position") : t("Close {pct}% of the position", { pct: fraction * 100 })}
            >
              {actions.busy === `close:${fraction}` ? "…" : fraction === 1 ? t("All") : `${fraction * 100}%`}
            </Button>
          ))}
        </div>
      )}
      {actions.error !== null && (
        <p role="alert" className="type-label text-negative">
          {actions.error}
        </p>
      )}
    </div>
  );
}
