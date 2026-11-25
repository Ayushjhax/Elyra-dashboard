"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CLOSE_FRACTIONS } from "@/lib/autotrade/manage";
import type { TradeView } from "@/lib/autotrade/types";
import { formatPriceUsd, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
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

type Write = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;

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

export function PositionControls({ trade, write, onNote }: { trade: TradeView; write: Write; onNote?: (note: string | null) => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [takeProfit, setTakeProfit] = useState(String(trade.takeProfit));
  const [stopLoss, setStopLoss] = useState(String(trade.stopLoss));

  const close = async (fraction: number) => {
    setBusy(`close:${fraction}`);
    setError(null);
    const result = await write(`/api/automation/positions/${trade.id}?fraction=${fraction}`, "DELETE");
    setBusy(null);
    if (result.error !== null) setError(result.error);
    else onNote?.(typeof result.body.note === "string" ? result.body.note : null);
  };

  const move = async () => {
    setBusy("move");
    setError(null);
    const result = await write(`/api/automation/positions/${trade.id}`, "PATCH", { takeProfit: Number(takeProfit), stopLoss: Number(stopLoss) });
    setBusy(null);
    if (result.error !== null) setError(result.error);
    else setEditing(false);
  };

  const partials = trade.partialCloses ?? [];
  const original = trade.originalSize ?? trade.size;

  return (
    <div className="flex flex-col gap-2">
      <FillReport trade={trade} />
      {partials.length > 0 && (
        <p className="type-label text-text-muted">
          {t("{closed} of {original} closed so far, {pnl} after fees", {
            closed: Number((original - trade.size).toPrecision(6)),
            original: Number(original.toPrecision(6)),
            pnl: formatUsd(trade.realisedPartialUsd ?? 0, { sign: true }),
          })}
        </p>
      )}

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-muted">{t("Take-profit ($)")}</span>
            <input
              inputMode="decimal"
              value={takeProfit}
              onChange={(event) => setTakeProfit(event.target.value)}
              className="type-data h-8 w-28 rounded-control border border-border-strong bg-surface-base px-2 text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-muted">{t("Stop-loss ($)")}</span>
            <input
              inputMode="decimal"
              value={stopLoss}
              onChange={(event) => setStopLoss(event.target.value)}
              className="type-data h-8 w-28 rounded-control border border-border-strong bg-surface-base px-2 text-text-primary"
            />
          </label>
          <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => void move()}>
            {busy === "move" ? t("Saving…") : t("Save exits")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setEditing(false)}>
            {t("Cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {!trade.fund && (
            <Button
              size="xs"
              onClick={() => {
                setTakeProfit(String(trade.takeProfit));
                setStopLoss(String(trade.stopLoss));
                setEditing(true);
              }}
            >
              {t("Edit TP/SL")}
            </Button>
          )}
          <span className="type-label ml-1 text-text-muted">{t("Close")}</span>
          {CLOSE_FRACTIONS.filter((fraction) => fraction === 1 || !trade.fund).map((fraction) => (
            <Button
              key={fraction}
              size="xs"
              variant={fraction === 1 ? "danger" : "quiet"}
              disabled={busy !== null}
              onClick={() => void close(fraction)}
              aria-label={fraction === 1 ? t("Close all of the position") : t("Close {pct}% of the position", { pct: fraction * 100 })}
            >
              {busy === `close:${fraction}` ? "…" : fraction === 1 ? t("All") : `${fraction * 100}%`}
            </Button>
          ))}
        </div>
      )}
      {error !== null && (
        <p role="alert" className="type-label text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
