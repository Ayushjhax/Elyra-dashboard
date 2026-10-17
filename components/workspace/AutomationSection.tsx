"use client";

import { useId, useMemo, useState } from "react";
import { BellRing, ChevronRight, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { DeliveryNote } from "@/components/panels/ChartAlerts";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Section } from "@/components/ui/Section";
import { isPast, useAlerts, type AlertsFeed } from "@/lib/alerts/useAlerts";
import { formatPriceUsd, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssets, useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import type { PriceAlert } from "@/lib/telegram/alerts";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Automation: the price rules Elyra watches for this account.

   Every rule here is a real price alert — the same rows the chart's Alerts
   and Telegram's `/alert` set. The delivery worker checks each one against
   live prices every five minutes and messages the linked chat on the first
   crossing, then the rule goes quiet until it is re-armed.

   A rule acts by telling the person, never by trading: exchange connections
   are read-only and nothing in this repository places an order. When there
   is nowhere to deliver to, the rule still shows the crossing against the
   live price here and says it was not sent.
--------------------------------------------------------------------------- */

type Status = "armed" | "crossed" | "fired";

const STATUS_DOT: Record<Status, string> = {
  armed: "bg-positive",
  crossed: "bg-agent-accent",
  fired: "bg-neutral-flat",
};

function statusOf(alert: PriceAlert, price: number | undefined): Status {
  if (alert.triggeredAt !== null) return "fired";
  return isPast(alert, price) ? "crossed" : "armed";
}

function statusLabel(status: Status, delivery: AlertsFeed["delivery"]): string {
  if (status === "fired") return "Fired — off until re-armed";
  if (status === "crossed") {
    return delivery === "telegram" ? "Crossed — sent on the next check" : "Crossed — not sent anywhere";
  }
  return "Armed";
}

function RuleRow({
  alert,
  price,
  feed,
  now,
}: {
  alert: PriceAlert;
  price: number | undefined;
  feed: AlertsFeed;
  now: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const detailId = useId();
  const status = statusOf(alert, price);
  const verb = alert.direction === "above" ? "rises above" : "falls below";
  const name = `${alert.symbol} ${verb} ${formatPriceUsd(alert.target)}`;
  const distance =
    price === undefined ? null : ((alert.target - price) / price) * 100;

  const rearm = async () => {
    setBusy(true);
    await feed.create({
      symbol: alert.symbol,
      direction: alert.direction,
      target: alert.target,
      currentPrice: price ?? null,
    });
    setBusy(false);
  };

  return (
    <li className="agent-rail border-b border-border-subtle last:border-b-0">
      <div
        className={cn(
          "metallic automation-row flex items-center gap-3 py-2.5 pl-[14px] pr-4",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
              open && "rotate-90",
            )}
          />
          <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", STATUS_DOT[status])} />
          <span className="min-w-0 flex-1">
            <span className={cn("type-data block truncate", status === "fired" ? "text-text-secondary" : "text-text-primary")}>
              {name}
            </span>
            <span className="type-label block truncate text-text-muted">
              {statusLabel(status, feed.delivery)}
              {status === "armed" && distance !== null ? ` · ${Math.abs(distance).toFixed(2)}% away` : ""}
              {status === "fired" && alert.triggeredAt && now !== null
                ? ` · ${formatRelativeTime(alert.triggeredAt, now)}`
                : ""}
            </span>
          </span>
          <span className="type-data-sm hidden shrink-0 rounded-chip border border-border-subtle px-1.5 text-text-secondary compact:inline">
            {alert.symbol}
          </span>
        </button>
        {status === "fired" && (
          <Button size="xs" variant="quiet" onClick={() => void rearm()} disabled={busy} aria-label={`Re-arm ${name}`}>
            <RotateCcw size={12} strokeWidth={1.5} aria-hidden />
            Re-arm
          </Button>
        )}
        <button
          type="button"
          onClick={() => void feed.remove(alert.id)}
          aria-label={`Remove ${name}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-text-muted hover:bg-surface-hover hover:text-negative"
        >
          <Trash2 size={13} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <div id={detailId} hidden={!open} className="pb-4 pl-[46px] pr-4">
        <dl className="grid gap-x-6 gap-y-3 compact:grid-cols-2">
          <div>
            <dt className="type-eyebrow text-text-muted">When</dt>
            <dd className="type-body-sm mt-1 text-text-primary">
              {alert.symbol} trades at or {alert.direction} {formatPriceUsd(alert.target)}
              {price !== undefined ? ` (now ${formatPriceUsd(price)})` : ""}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow text-text-muted">Then</dt>
            <dd className="type-body-sm mt-1 text-text-primary">
              {feed.delivery === "telegram"
                ? "Message your linked Telegram chat, once"
                : "Show the crossing here — nothing is sent until Telegram is set up"}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow text-text-muted">Set</dt>
            <dd className="type-data mt-1 text-text-secondary">
              {alert.createdAt ? `${formatTimestamp(alert.createdAt)} UTC` : "—"}
              {alert.createdPrice !== null ? ` at ${formatPriceUsd(alert.createdPrice)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow text-text-muted">Last fired</dt>
            <dd className="type-data mt-1 text-text-secondary">
              {alert.triggeredAt
                ? `${formatTimestamp(alert.triggeredAt)} UTC${
                    alert.triggeredPrice != null ? ` at ${formatPriceUsd(alert.triggeredPrice)}` : ""
                  }`
                : "Never"}
            </dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function RuleBuilder({
  open,
  onOpenChange,
  feed,
  symbol,
  price,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: AlertsFeed;
  symbol: string;
  price: number | null;
}) {
  const [ticker, setTicker] = useState(symbol);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetId = useId();
  const tickerId = useId();
  const onChartSymbol = ticker.trim().toUpperCase() === symbol;

  const suggest = (side: "above" | "below") => {
    if (price === null || !onChartSymbol) return "";
    const value = price * (side === "above" ? 1.02 : 0.98);
    return value.toFixed(priceDecimals(value));
  };

  const submit = async () => {
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0 || saving) return;
    setSaving(true);
    const failed = await feed.create({
      symbol: ticker.trim().toUpperCase(),
      direction,
      target: value,
      currentPrice: onChartSymbol ? price : null,
    });
    setSaving(false);
    setError(failed);
    if (failed === null) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTicker(symbol);
          setTarget(suggest(direction));
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent aria-describedby="new-rule-help">
        <DialogHeader>
          <DialogTitle>New price rule</DialogTitle>
          <DialogDescription id="new-rule-help">
            Elyra checks it every five minutes and tells you once when price crosses.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-rule-form"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={tickerId} className="type-label text-text-secondary">
              Market
            </label>
            <input
              id={tickerId}
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              className="type-data h-9 rounded-control border border-border-strong bg-surface-raised px-2.5 text-text-primary focus:border-accent-quiet focus:outline-none"
            />
          </div>
          <div role="radiogroup" aria-label="When price" className="flex gap-1">
            {(["above", "below"] as const).map((side) => (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={direction === side}
                onClick={() => {
                  setDirection(side);
                  setTarget(suggest(side) || target);
                }}
                className={cn(
                  "type-label h-8 flex-1 rounded-control",
                  direction === side ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover",
                )}
              >
                {side === "above" ? "Rises above" : "Falls below"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={targetId} className="type-label text-text-secondary">
              Price in USD
              {onChartSymbol && price !== null ? (
                <span className="text-text-muted"> · now {formatPriceUsd(price)}</span>
              ) : null}
            </label>
            <input
              id={targetId}
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ""))}
              className="type-data h-9 rounded-control border border-border-strong bg-surface-raised px-2.5 text-text-primary focus:border-accent-quiet focus:outline-none"
            />
          </div>
          <p className="type-label text-text-muted">
            Then: a message to your linked Telegram chat. A rule never places a trade — exchange
            connections in Elyra are read-only.
          </p>
          {error !== null && (
            <p role="alert" className="type-label text-negative">
              {error}
            </p>
          )}
          <DeliveryNote delivery={feed.delivery} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-rule-form"
            variant="accent"
            disabled={saving || ticker.length === 0 || !(Number(target) > 0)}
          >
            {saving ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRules({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <BellRing size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
      <div className="type-body-sm text-text-secondary">{children}</div>
    </div>
  );
}

export function AutomationSection() {
  const open = useElyraStore((state) => state.automationOpen);
  const setOpen = useElyraStore((state) => state.setAutomationOpen);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const auth = useElyraAuth();
  const feed = useAlerts();
  const now = useMinute();
  const [builderOpen, setBuilderOpen] = useState(false);

  const { byId } = useAssets([selectedAssetId]);
  const chartSymbol = byId.get(selectedAssetId)?.symbol.toUpperCase() ?? "";
  const symbols = useMemo(
    () => [...new Set([...feed.alerts.map((alert) => alert.symbol), chartSymbol].filter(Boolean))],
    [feed.alerts, chartSymbol],
  );
  const assets = useAssetsBySymbols(symbols);
  const ids = useMemo(() => [...assets.values()].map((asset) => asset.id), [assets]);
  const prices = usePrices(ids);
  const priceOf = (symbol: string) => {
    const asset = assets.get(symbol.toUpperCase());
    return asset ? prices.rows.get(asset.id)?.price : undefined;
  };

  const armed = feed.alerts.filter((alert) => alert.triggeredAt === null).length;

  return (
    <Section
      title="Automation"
      icon={<Zap size={16} strokeWidth={1.5} />}
      meta={feed.signedIn ? `${armed} armed` : undefined}
      open={open}
      onOpenChange={setOpen}
      actions={
        feed.signedIn ? (
          <Button size="sm" variant="ghost" onClick={() => setBuilderOpen(true)} aria-haspopup="dialog">
            <Plus size={14} strokeWidth={1.5} aria-hidden />
            New rule
          </Button>
        ) : undefined
      }
    >
      {!auth.available ? (
        <EmptyRules>Sign-in is not configured, so no rules can be saved.</EmptyRules>
      ) : !feed.signedIn ? (
        <EmptyRules>
          <p>Connect a wallet to set price rules. Elyra watches them and tells you on Telegram when one crosses.</p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        </EmptyRules>
      ) : feed.loading ? (
        <div className="flex flex-col gap-2 px-4 py-4" aria-label="Loading rules">
          <span className="skeleton block h-4 w-3/5" />
          <span className="skeleton block h-4 w-2/5" />
        </div>
      ) : feed.alerts.length === 0 ? (
        <EmptyRules>
          {feed.writeError !== null || feed.error !== null ? (
            <p className="text-negative">{feed.writeError ?? feed.error}</p>
          ) : (
            <p>No rules yet. Add one here, from the chart&rsquo;s Alerts, or with /alert in Telegram.</p>
          )}
        </EmptyRules>
      ) : (
        <>
          {feed.writeError !== null && (
            <p role="alert" className="type-label border-b border-border-subtle px-4 py-2.5 text-negative">
              {feed.writeError}
            </p>
          )}
          <ul className="list-none">
            {feed.alerts.map((alert) => (
              <RuleRow key={alert.id} alert={alert} price={priceOf(alert.symbol)} feed={feed} now={now} />
            ))}
          </ul>
          <DeliveryNote delivery={feed.delivery} className="border-t border-border-subtle px-4 py-2.5" />
        </>
      )}

      {feed.signedIn && (
        <RuleBuilder
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          feed={feed}
          symbol={chartSymbol}
          price={chartSymbol ? (priceOf(chartSymbol) ?? null) : null}
        />
      )}
    </Section>
  );
}
