"use client";

import { useId, useRef, useState } from "react";
import { Crosshair, Zap } from "lucide-react";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { Field, ModeChip, Pair, Problem, field, marketLabel } from "@/components/automation/parts";
import { OrderAccount } from "@/components/paper/Paper";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { formatPriceUsd, formatRelativeTime, formatUsd } from "@/lib/format";
import { LIMITS } from "@/lib/autotrade/rules";
import type { AutomationResponse, OrderView } from "@/lib/autotrade/types";
import type { AutomationFeed } from "@/lib/autotrade/useAutomation";
import { refreshPaper, usePaper } from "@/lib/paper/usePaper";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Order entry, by hand: a market order now, or a limit order at a level —
   the same routes the chart's ticket uses (/api/automation/trade and
   /api/automation/orders), each held to LIMITS and the account gate there.

   The account the header's Live / Paper switch shows is the account the
   order goes to (OrderAccount says which, and switches it — switching only
   changes the account; it never places or queues an order). Where Live
   cannot send — a paper-only server, or a key not yet approved — the order
   buttons are disabled and the reason is said beside the switch, rather
   than sending an order the server will refuse.
--------------------------------------------------------------------------- */

type Tab = "market" | "limit";

/** Whether an order on the chosen account can be sent, and if not, why. */
function useSendable(data: AutomationResponse): { mode: "paper" | "live"; blocked: string | null; liveNote: string } {
  const t = useT();
  const mode = usePaper().mode;
  const keyReady = data.agent !== null && data.agent.approved && data.agent.network === data.live.network;
  const liveNote = !data.live.enabled
    ? t("This server sends no live orders, so an order on Live is refused. Switch to Paper to practise.")
    : t("Approve Elyra's trading key on Automation before trading live on Hyperliquid {network}.", { network: data.live.network });
  const blocked =
    mode !== "live" ? null : !data.live.enabled ? t("Live orders are unavailable on this server.") : !keyReady ? t("Live orders need the trading key approved.") : null;
  return { mode, blocked, liveNote };
}

function MarketForm({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const [form, setForm] = useState({ coin: "BTC", sizeUsd: "50", leverage: "2", takeProfitPct: "4", stopLossPct: "2" });
  const { mode, blocked, liveNote } = useSendable(data);
  const [busy, setBusy] = useState<"long" | "short" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const trade = (side: "long" | "short") => {
    if (blocked !== null) return;
    setBusy(side);
    setError(null);
    setDone(null);
    void feed
      .write("/api/automation/trade", "POST", {
        coin: form.coin,
        side,
        sizeUsd: Number(form.sizeUsd),
        leverage: Number(form.leverage),
        takeProfitPct: Number(form.takeProfitPct),
        stopLossPct: Number(form.stopLossPct),
        mode,
      })
      .then((result) => {
        setError(result.error);
        refreshPaper();
        if (result.error === null) {
          setDone(
            t("{side} {market} opened ({mode}). It is under Trade history.", {
              side: side === "long" ? t("Long") : t("Short"),
              market: marketLabel(form.coin),
              mode: mode === "live" ? t("live {network}", { network: data.live.network }) : t("paper"),
            }),
          );
        }
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-col gap-3">
      <Field id="trade-coin" label={t("Market")}>
        <select id="trade-coin" className={field} value={form.coin} onChange={set("coin")}>
          <MarketOptions />
        </select>
      </Field>
      <Pair>
        <Field id="trade-size" label={t("Size ($)")}>
          <input id="trade-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
        </Field>
        <Field id="trade-leverage" label={t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}>
          <input id="trade-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
        </Field>
      </Pair>
      <Pair>
        <Field id="trade-tp" label={t("Take-profit (% from fill)")}>
          <input id="trade-tp" inputMode="decimal" className={field} value={form.takeProfitPct} onChange={set("takeProfitPct")} />
        </Field>
        <Field id="trade-sl" label={t("Stop-loss (% from fill)")}>
          <input id="trade-sl" inputMode="decimal" className={field} value={form.stopLossPct} onChange={set("stopLossPct")} />
        </Field>
      </Pair>
      <OrderAccount liveReady={blocked === null} liveNote={liveNote} />
      <p className="type-label text-text-muted">
        {t("Opens at the market now, isolated margin, with the take-profit and stop-loss set from the fill and placed on Hyperliquid in the same request. Stock markets are trade[XYZ] perps — contracts that track the share price, not shares — and keep their own margin on Hyperliquid.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="accent" disabled={busy !== null || blocked !== null} aria-describedby={blocked !== null ? "trade-blocked" : undefined} onClick={() => trade("long")}>
          {busy === "long" ? t("Opening") : t("Long now")}
        </Button>
        <Button variant="quiet" disabled={busy !== null || blocked !== null} aria-describedby={blocked !== null ? "trade-blocked" : undefined} onClick={() => trade("short")}>
          {busy === "short" ? t("Opening") : t("Short now")}
        </Button>
      </div>
      {blocked !== null && (
        <p id="trade-blocked" className="type-label text-text-secondary">
          {blocked}
        </p>
      )}
      {done !== null && (
        <p role="status" className="type-label text-positive">
          {done}
        </p>
      )}
      <Problem text={error} />
    </div>
  );
}

function LimitForm({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const [form, setForm] = useState({ coin: "BTC", side: "long", price: "", sizeUsd: "50", leverage: "2", takeProfit: "", stopLoss: "" });
  const { mode, blocked, liveNote } = useSendable(data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const long = form.side === "long";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked !== null) return;
        setBusy(true);
        void feed
          .write("/api/automation/orders", "POST", {
            coin: form.coin,
            side: form.side,
            price: Number(form.price),
            sizeUsd: Number(form.sizeUsd),
            leverage: Number(form.leverage),
            takeProfit: Number(form.takeProfit),
            stopLoss: Number(form.stopLoss),
            mode,
          })
          .then((result) => {
            setError(result.error);
            refreshPaper();
            if (result.error === null) setForm((current) => ({ ...current, price: "", takeProfit: "", stopLoss: "" }));
          })
          .finally(() => setBusy(false));
      }}
    >
      <Pair>
        <Field id="order-coin" label={t("Market")}>
          <select id="order-coin" className={field} value={form.coin} onChange={set("coin")}>
            <MarketOptions />
          </select>
        </Field>
        <Field id="order-side" label={t("Side")}>
          <select id="order-side" className={field} value={form.side} onChange={set("side")}>
            <option value="long">{t("Long")}</option>
            <option value="short">{t("Short")}</option>
          </select>
        </Field>
      </Pair>
      <Pair>
        <Field id="order-size" label={t("Size ($)")}>
          <input id="order-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
        </Field>
        <Field id="order-leverage" label={t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}>
          <input id="order-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
        </Field>
      </Pair>
      <Field id="order-price" label={t("Open at (price, $)")}>
        <input id="order-price" inputMode="decimal" className={field} value={form.price} onChange={set("price")} placeholder={long ? t("Below the market") : t("Above the market")} />
      </Field>
      <Pair>
        <Field id="order-tp" label={t("Take-profit (price, $)")}>
          <input id="order-tp" inputMode="decimal" className={field} value={form.takeProfit} onChange={set("takeProfit")} placeholder={long ? t("Above the entry") : t("Below the entry")} />
        </Field>
        <Field id="order-sl" label={t("Stop-loss (price, $)")}>
          <input id="order-sl" inputMode="decimal" className={field} value={form.stopLoss} onChange={set("stopLoss")} placeholder={long ? t("Below the entry") : t("Above the entry")} />
        </Field>
      </Pair>
      <OrderAccount liveReady={blocked === null} liveNote={liveNote} />
      <p className="type-label text-text-muted">
        {t("A long waits below the current price and a short above it. Live orders rest on Hyperliquid and fill there even when Elyra is closed; the take-profit and stop-loss attach the moment it fills. Paper orders fill at the next five-minute check after the price trades through the level.")}
      </p>
      <Button type="submit" variant="accent" disabled={busy || blocked !== null} aria-describedby={blocked !== null ? "order-blocked" : undefined}>
        <Crosshair size={15} aria-hidden />
        {busy ? t("Placing…") : t("Place limit order")}
      </Button>
      {blocked !== null && (
        <p id="order-blocked" className="type-label text-text-secondary">
          {blocked}
        </p>
      )}
      <Problem text={error} />
    </form>
  );
}

function OrderRow({ order, feed, now }: { order: OrderView; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="type-data-sm min-w-0 truncate tabular-nums text-text-primary">
          {t("{side} {coin} at {price}", { side: order.side === "long" ? t("Long") : t("Short"), coin: marketLabel(order.coin), price: formatPriceUsd(order.price) })}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ModeChip mode={order.mode} network={order.network} />
          <span className={cn("type-label", order.status === "open" ? "text-text-primary" : "text-text-muted")}>
            {order.status === "open" ? t("Waiting") : order.status === "filled" ? t("Filled") : order.status === "cancelled" ? t("Cancelled") : t("Failed")}
          </span>
        </span>
      </div>
      <span className="type-label tabular-nums text-text-muted">
        {t("{sizeUsd} at {leverage}x · TP {takeProfit} · SL {stopLoss}", { sizeUsd: formatUsd(order.sizeUsd, { decimals: 0 }), leverage: order.leverage, takeProfit: formatPriceUsd(order.takeProfit), stopLoss: formatPriceUsd(order.stopLoss) })}
        {now !== null && <> · {formatRelativeTime(order.createdAt, now, t.locale)}</>}
      </span>
      {order.error !== null && <span className="type-label text-text-secondary">{order.error}</span>}
      {order.status === "open" && (
        <div>
          <Button
            size="xs"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void feed
                .write(`/api/automation/orders/${order.id}`, "DELETE")
                .then((result) => setError(result.error))
                .finally(() => setBusy(false));
            }}
          >
            {t("Cancel order")}
          </Button>
        </div>
      )}
      <Problem text={error} />
    </li>
  );
}

export function OrderEntry({ data, feed, now }: { data: AutomationResponse; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("market");
  const base = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const open = data.orders.filter((order) => order.status === "open");
  const past = data.orders.filter((order) => order.status !== "open").slice(0, 8);
  const entries: Array<[Tab, string]> = [
    ["market", t("Market")],
    ["limit", t("Limit")],
  ];

  return (
    <DrawerCard icon={Zap} title={t("Order entry")}>
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label={t("Order type")}
          className="flex gap-1 border-b border-border-subtle"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next: Tab = event.key === "Home" ? "market" : event.key === "End" ? "limit" : tab === "market" ? "limit" : "market";
            setTab(next);
            tabs.current[next === "market" ? 0 : 1]?.focus();
          }}
        >
          {entries.map(([value, label], index) => {
            const active = tab === value;
            return (
              <button
                key={value}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${base}-${value}`}
                aria-selected={active}
                aria-controls={`${base}-${value}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(value)}
                className={cn(
                  "type-body-sm -mb-px h-10 border-b-2 px-3 font-medium transition-colors duration-[var(--dur-fast)] ease-brand",
                  active ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Both stay mounted, so a half-filled form survives a switch of tab. */}
        <div role="tabpanel" id={`${base}-market-panel`} aria-labelledby={`${base}-market`} hidden={tab !== "market"}>
          <MarketForm data={data} feed={feed} />
        </div>
        <div role="tabpanel" id={`${base}-limit-panel`} aria-labelledby={`${base}-limit`} hidden={tab !== "limit"}>
          <LimitForm data={data} feed={feed} />
        </div>

        {(open.length > 0 || past.length > 0) && (
          <section aria-label={t("Your limit orders")} className="flex flex-col gap-2 border-t border-border-subtle pt-3">
            <h3 className="type-eyebrow text-text-muted">{t("Your limit orders")}</h3>
            <ul className="flex flex-col divide-y divide-border-subtle">
              {[...open, ...past].map((order) => (
                <OrderRow key={order.id} order={order} feed={feed} now={now} />
              ))}
            </ul>
            {open.some((order) => order.mode === "live") && (
              <p className="type-label text-text-muted">{t("Pausing automation does not cancel resting live orders — cancel them here.")}</p>
            )}
          </section>
        )}
      </div>
    </DrawerCard>
  );
}
