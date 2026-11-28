"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import type { AlertsResponse } from "@/app/api/alerts/route";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { formatPriceUsd } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAlertRequest } from "@/lib/alerts/alertRequest";
import { isPast, useAlerts } from "@/lib/alerts/useAlerts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Price alerts on the chart's own market.

   The alerts are the ones Telegram's `/alert` sets — one table, checked
   against live prices by the delivery worker, delivered to the linked chat.
   This sets and clears them for the market on screen, and says plainly when
   no chat is linked, because an alert with nowhere to go is worse than none.

   The decision brief's "Set alert" opens it from elsewhere, with the market
   and the level's price already filled in (lib/alerts/alertRequest.ts).
--------------------------------------------------------------------------- */

export function ChartAlerts({
  symbol,
  price,
  iconOnly = false,
}: {
  symbol: string;
  price: number | null;
  /** The toolbar has no room for the label, so the name is a tooltip. */
  iconOnly?: boolean;
}) {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useAlerts();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const signedIn = feed.signedIn;
  const alerts = feed.alerts.filter((alert) => alert.symbol === symbol.toUpperCase());

  /* A request for this market opens the form filled in — adjusted during
     render, so the form never paints empty first. One for another market
     waits until the chart has switched to it. */
  const request = useAlertRequest();
  /* A request already answered before this mounted is not a new one. */
  const [handled, setHandled] = useState(() => request?.at ?? 0);
  const [opened, setOpened] = useState(0);
  if (request !== null && request.at !== handled && request.symbol === symbol.toUpperCase()) {
    setHandled(request.at);
    setOpened(opened + 1);
    setOpen(true);
    setDirection(request.direction);
    setTarget(request.target.toFixed(priceDecimals(request.target)));
    setError(null);
  }
  useEffect(() => {
    if (opened === 0) return;
    triggerRef.current?.scrollIntoView({ block: "nearest" });
    /* After the popover's own focus-on-open, so the price is ready to edit. */
    const frame = window.requestAnimationFrame(() => targetRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [opened]);

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
      label={t("Price alerts for {symbol}", { symbol })}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-72 p-3"
      trigger={
        <Tip label={iconOnly ? t("Price alerts") : null}>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls="chart-alerts"
          aria-haspopup="dialog"
          aria-label={(armed.length > 0 ? t("Price alerts, {count} armed", { count: armed.length }) : t("Price alerts"))}
          onClick={openPanel}
          className={cn(
            "chart-control type-label inline-flex h-8 items-center gap-1.5 rounded-control",
            iconOnly ? "px-2" : "px-2.5",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            open
              ? "bg-surface-hover text-text-primary"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Bell size={15} strokeWidth={1.5} aria-hidden />
          {!iconOnly && <span>{t("Alerts")}</span>}
          {armed.length > 0 && <span className="type-data-sm text-text-muted">{armed.length}</span>}
        </button>
        </Tip>
      }
    >
      <p className="type-panel-title text-text-primary">{t("{symbol} price alerts", { symbol })}</p>

      {!auth.available ? (
        <p className="type-body-sm mt-2 text-text-secondary">{t("Sign-in is not configured, so alerts cannot be saved.")}</p>
      ) : !signedIn ? (
        <div className="mt-2">
          <p className="type-body-sm text-text-secondary">{t("Sign in to set alerts on {symbol}.", { symbol })}</p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            {t("Connect wallet")}
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
                    {alert.direction === "above" ? t("Above") : t("Below")} {formatPriceUsd(alert.target)}
                  </span>
                  <span className="type-label text-text-muted">
                    {alert.triggeredAt ? t("Fired") : isPast(alert, price) ? t("Crossed") : t("Armed")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void feed.remove(alert.id)}
                    aria-label={t("Remove the {direction} {target} alert", { direction: alert.direction, target: formatPriceUsd(alert.target) })}
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
            <div role="radiogroup" aria-label={t("Direction")} className="flex gap-1">
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
                  {side === "above" ? t("Rises above") : t("Falls below")}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="chart-alert-target">
              {t("Alert price in USD")}
            </label>
            <input
              ref={targetRef}
              id="chart-alert-target"
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder={t("Price in USD")}
              className="type-data h-9 rounded-control border border-border-strong bg-surface-raised px-2.5 text-text-primary placeholder:text-text-muted focus:border-accent-quiet focus:outline-none"
            />
            <Button type="submit" size="sm" variant="accent" disabled={saving || Number(target) <= 0}>
              {saving ? t("Saving…") : t("Set alert")}
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
  const t = useT();
  if (delivery === "telegram" || delivery === "app") return null;
  if (delivery === "inbox") {
    return (
      <p className={cn("type-label text-text-muted", className)}>
        {t("A crossing reaches your Elyra app’s inbox, but push is off — turn price alerts on in the app’s notification settings to be told at once.")}
      </p>
    );
  }
  return (
    <p className={cn("type-label text-text-muted", className)}>
      {delivery === "muted"
        ? t("Price alerts are switched off for your Telegram chat, so a crossing is shown here but not sent. ")
        : t("Alerts are delivered on Telegram, and no chat is linked — a crossing is shown here but not sent. ")}
      <Link href="/agent" className="text-text-secondary underline underline-offset-2">
        {delivery === "muted" ? t("Turn them on") : t("Link Telegram")}
      </Link>
      .
    </p>
  );
}
