"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import type { AlertsResponse } from "@/app/api/alerts/route";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { formatPriceUsd } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { isPast, useAlerts } from "@/lib/alerts/useAlerts";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Price alerts on the chart's own market.

   The alerts are the ones Telegram's `/alert` sets — one table, checked
   against live prices by the delivery worker, delivered to the linked chat.
   This sets and clears them for the market on screen, and says plainly when
   no chat is linked, because an alert with nowhere to go is worse than none.
--------------------------------------------------------------------------- */

export function ChartAlerts({ symbol, price }: { symbol: string; price: number | null }) {
  const auth = useElyraAuth();
  const feed = useAlerts();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = feed.signedIn;
  const alerts = feed.alerts.filter((alert) => alert.symbol === symbol.toUpperCase());

  const suggest = (side: "above" | "below") => {
    if (price === null) return "";
    const value = price * (side === "above" ? 1.02 : 0.98);
    return value.toFixed(priceDecimals(value));
  };

  const openPanel = () => {
    const next = !open;
    setOpen(next);
    if (next && target === "") setTarget(suggest(direction));
  };

  const create = async () => {
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0 || saving) return;
    setSaving(true);
    setError(await feed.create({ symbol, direction, target: value, currentPrice: price }));
    setSaving(false);
  };

  const armed = alerts.filter((alert) => alert.triggeredAt === null);
  const shownError = error ?? feed.writeError ?? feed.error;

  return (
    <Popover
      id="chart-alerts"
      label={`Price alerts for ${symbol}`}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-72 p-3"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="chart-alerts"
          aria-haspopup="dialog"
          aria-label={`Price alerts${armed.length > 0 ? `, ${armed.length} armed` : ""}`}
          onClick={openPanel}
          className={cn(
            "type-label inline-flex h-8 items-center gap-1.5 rounded-control px-2 @4xl:px-2.5",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            open
              ? "bg-surface-hover text-text-primary"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Bell size={15} strokeWidth={1.5} aria-hidden />
          <span className="hidden @4xl:inline">Alerts</span>
          {armed.length > 0 && <span className="type-data-sm text-text-muted">{armed.length}</span>}
        </button>
      }
    >
      <p className="type-panel-title text-text-primary">{symbol} price alerts</p>

      {!auth.available ? (
        <p className="type-body-sm mt-2 text-text-secondary">Sign-in is not configured, so alerts cannot be saved.</p>
      ) : !signedIn ? (
        <div className="mt-2">
          <p className="type-body-sm text-text-secondary">Sign in to set alerts on {symbol}.</p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        </div>
      ) : (
        <>
          {shownError !== null && <p role="alert" className="type-label mt-2 break-words text-negative">{shownError}</p>}

          {alerts.length > 0 && (
            <ul className="mt-2 list-none divide-y divide-border-subtle">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center gap-2 py-1.5">
                  <span className="type-data min-w-0 flex-1 text-text-primary">
                    {alert.direction === "above" ? "Above" : "Below"} {formatPriceUsd(alert.target)}
                  </span>
                  <span className="type-label text-text-muted">
                    {alert.triggeredAt ? "Fired" : isPast(alert, price) ? "Crossed" : "Armed"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void feed.remove(alert.id)}
                    aria-label={`Remove the ${alert.direction} ${formatPriceUsd(alert.target)} alert`}
                    className="inline-flex size-7 items-center justify-center rounded-chip text-text-muted hover:bg-surface-hover hover:text-negative"
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div role="radiogroup" aria-label="Direction" className="flex gap-1">
              {(["above", "below"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={direction === side}
                  onClick={() => {
                    setDirection(side);
                    setTarget(suggest(side));
                  }}
                  className={cn(
                    "type-label h-8 flex-1 rounded-control capitalize",
                    direction === side
                      ? "bg-surface-active text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover",
                  )}
                >
                  {side === "above" ? "Rises above" : "Falls below"}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="chart-alert-target">
              Alert price in USD
            </label>
            <input
              id="chart-alert-target"
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Price in USD"
              className="type-data h-9 rounded-control border border-border-strong bg-surface-raised px-2.5 text-text-primary placeholder:text-text-muted focus:border-accent-quiet focus:outline-none"
            />
            <Button type="submit" size="sm" variant="accent" disabled={saving || Number(target) <= 0}>
              {saving ? "Saving…" : "Set alert"}
            </Button>
          </form>

          <DeliveryNote delivery={feed.loading ? "telegram" : feed.delivery} className="mt-3" />
        </>
      )}
    </Popover>
  );
}

/**
 * Where a crossing goes, said where the alert is set. Nothing when delivery
 * works; otherwise what is missing and where to fix it.
 */
export function DeliveryNote({
  delivery,
  className,
}: {
  delivery: AlertsResponse["delivery"];
  className?: string;
}) {
  if (delivery === "telegram" || delivery === "app") return null;
  if (delivery === "inbox") {
    return (
      <p className={cn("type-label text-text-muted", className)}>
        A crossing reaches your Elyra app&rsquo;s inbox, but push is off — turn price alerts on in the app&rsquo;s
        notification settings to be told at once.
      </p>
    );
  }
  return (
    <p className={cn("type-label text-text-muted", className)}>
      {delivery === "muted"
        ? "Price alerts are switched off for your Telegram chat, so a crossing is shown here but not sent. "
        : "Alerts are delivered on Telegram, and no chat is linked — a crossing is shown here but not sent. "}
      <Link href="/agent" className="text-text-secondary underline underline-offset-2">
        {delivery === "muted" ? "Turn them on" : "Link Telegram"}
      </Link>
      .
    </p>
  );
}
