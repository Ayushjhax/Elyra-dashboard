"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSignTypedData } from "@privy-io/react-auth";
import { BarChart3, Bot, Crosshair, History, KeyRound, ListChecks, Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { formatPriceUsd, formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import type { GroupStats, PaperAnalysis } from "@/lib/autotrade/analysis";
import { MarketOptions } from "@/components/automation/MarketOptions";
import type { RuleHandoff } from "@/lib/autotrade/handoff";
import { AUTOTRADE_INTERVALS, LIMITS, marketFor } from "@/lib/autotrade/rules";
import type { AutomationResponse, OrderView, RuleView, StrategyOption, TradeView } from "@/lib/autotrade/types";
import { useAutomation, type AutomationFeed } from "@/lib/autotrade/useAutomation";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import type { Translator } from "@/lib/i18n/translate";
import { FillReport, PositionControls } from "@/components/trade/PositionControls";

/* ---------------------------------------------------------------------------
   Trading automation: rules Elyra runs on Hyperliquid perps, and the trades
   a person places by hand through the same key — a market order now, or a
   limit order at a level — each with its take-profit and stop-loss.

   Every rule is checked on each five-minute tick against its latest closed
   bar; an entry goes to Hyperliquid with its take-profit and stop-loss in the
   same request, so the exchange holds them between checks. Rules start on
   paper. Live needs the server switched to live AND Elyra's trading key
   approved from the person's own wallet — a key that can trade and cannot
   withdraw.
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

/* ---- status and the kill switch ---- */

function StatusCard({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(String(data.settings.dailyLossLimitUsd));
  const [maxOpen, setMaxOpen] = useState(String(data.settings.maxOpenPositions));
  const open = data.trades.filter((trade) => trade.status === "open" || trade.status === "opening").length;

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    const result = await feed.write("/api/automation", "POST", body);
    setError(result.error);
    setBusy(false);
  };

  return (
    <DrawerCard
      icon={Bot}
      title={t("Status")}
      right={data.settings.paused ? <StatusDot tone="caution">{t("Paused")}</StatusDot> : <StatusDot tone="positive">{t("Running")}</StatusDot>}
    >
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {data.live.enabled
            ? t("Live rules trade on Hyperliquid {network}. Paper rules trade nothing and record what would have happened.", { network: data.live.network })
            : t("This server sends no live orders: every rule runs on paper and records what would have happened.")}{t(" Rules are checked every five minutes. {open}", { open })} {open === 1 ? t("position is") : t("positions are")}{" "}{t("open. Every entry, exit and failure is sent to your notifications, your phone and your linked Telegram chat, whatever your alert settings.")}
        </p>
        <div>
          <Button
            size="sm"
            variant={data.settings.paused ? "accent" : "danger"}
            disabled={busy}
            onClick={() => void save({ paused: !data.settings.paused })}
          >
            {data.settings.paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {data.settings.paused ? t("Resume automation") : t("Pause all entries")}
          </Button>
          <p className="type-label mt-1.5 text-text-muted">
            {t("Pausing stops new entries at the next check. Open positions keep their take-profit and stop-loss.")}
          </p>
        </div>
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ dailyLossLimitUsd: Number(limit), maxOpenPositions: Number(maxOpen) });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="auto-loss">{t("Daily loss limit ($)")}</Label>
            <input id="auto-loss" inputMode="decimal" className={field} value={limit} onChange={(event) => setLimit(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="auto-open">{t("Most open positions")}</Label>
            <input id="auto-open" inputMode="numeric" className={field} value={maxOpen} onChange={(event) => setMaxOpen(event.target.value)} />
          </div>
          <p className="type-label col-span-2 text-text-muted">
            {t("Past the day's loss limit no rule enters again until 00:00 UTC.")}
          </p>
          <div className="col-span-2">
            <Button size="sm" type="submit" disabled={busy}>
              {t("Save limits")}
            </Button>
          </div>
        </form>
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}

/* ---- Elyra's trading key ---- */

function KeyCard({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const { signTypedData } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agent = data.agent;
  const approvedHere = agent !== null && agent.approved && agent.network === data.live.network;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const prepared = await feed.write("/api/automation/agent", "POST", { step: "prepare" });
      if (prepared.error !== null) throw new Error(prepared.error);
      const typedData = prepared.body.typedData as Parameters<typeof signTypedData>[0];
      const { signature } = await signTypedData(typedData, {
        address: data.accountAddress ?? undefined,
        uiOptions: { title: t("Approve Elyra's trading key"), description: t("It can place and cancel orders on your Hyperliquid account. It cannot withdraw.") },
      });
      const approved = await feed.write("/api/automation/agent", "POST", { step: "approve", signature });
      if (approved.error !== null) throw new Error(approved.error);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("The approval did not complete.");
      setError(/reject|denied|cancel|closed/i.test(message) ? t("Cancelled — nothing was approved.") : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerCard
      icon={KeyRound}
      title={t("Trading key")}
      right={approvedHere ? <StatusDot tone="positive">{t("Approved")}</StatusDot> : <StatusDot tone="muted">{t("Not approved")}</StatusDot>}
    >
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {t("Live rules trade through an API wallet you approve from your own wallet. It can place and cancel orders on your Hyperliquid account and cannot withdraw or transfer anything. You can remove it on Hyperliquid at any time.")}
        </p>
        {data.accountAddress === null ? (
          <p className="type-label text-text-muted">{t("This account has no EVM wallet to hold a Hyperliquid account.")}</p>
        ) : (
          <>
            <p className="type-label text-text-muted">
              {t("Account")}{" "}<span className="type-mono-addr">{truncateMiddle(data.accountAddress, 6, 4)}</span>{" "}{t("on Hyperliquid {network}", { network: data.live.network })}
              {agent !== null && <>{" "}{t("· key")}{" "}<span className="type-mono-addr">{truncateMiddle(agent.agentAddress, 6, 4)}</span></>}
            </p>
            {!approvedHere && (
              <div>
                <Button size="sm" variant="accent" disabled={busy} onClick={() => void approve()}>
                  {busy ? t("Waiting for your wallet") : t("Approve trading key")}
                </Button>
                <p className="type-label mt-1.5 text-text-muted">{t("Hyperliquid accepts this only from an account that has deposited.")}</p>
              </div>
            )}
          </>
        )}
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}

/* ---- rules ---- */

function ruleSummary(rule: RuleView, strategies: StrategyOption[], t: Translator): string {
  const strategy = t(strategies.find((entry) => entry.id === rule.strategyId)?.name ?? rule.strategyId);
  return t("{side} · {strategy} · {coin} {interval} · {size} at {leverage}x · TP {tp}% · SL {sl}%", {
    side: rule.side === "short" ? t("Short") : t("Long"),
    strategy,
    coin: rule.coin,
    interval: rule.interval,
    size: formatUsd(rule.sizeUsd, { decimals: 0 }),
    leverage: rule.leverage,
    tp: rule.takeProfitPct,
    sl: rule.stopLossPct,
  });
}

function RuleRow({ rule, data, feed, now }: { rule: RuleView; data: AutomationResponse; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (method: "PATCH" | "DELETE", body?: Record<string, unknown>) => {
    setBusy(true);
    const result = await feed.write(`/api/automation/rules/${rule.id}`, method, body);
    setError(result.error);
    setBusy(false);
  };

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-panel-title truncate text-text-primary">{rule.name}</span>
          <span className="type-label text-text-muted">{ruleSummary(rule, data.strategies, t)}</span>
        </div>
        <span
          className={cn(
            "type-label inline-flex h-6 shrink-0 items-center rounded-chip border px-2",
            rule.mode === "live" ? "border-accent text-text-primary" : "border-border-subtle text-text-secondary",
          )}
        >
          {rule.mode === "live" ? t("Live") : t("Paper")}
        </span>
      </div>
      {rule.lastNote !== null && (
        <p className="type-label text-text-secondary">
          {rule.lastNote}
          {rule.lastCheckedAt !== null && now !== null && <span className="text-text-muted"> · {formatRelativeTime(rule.lastCheckedAt, now, t.locale)}</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="quiet" disabled={busy} onClick={() => void run("PATCH", { enabled: !rule.enabled })}>
          {rule.enabled ? t("Turn off") : t("Turn on")}
        </Button>
        <Button size="xs" variant="quiet" disabled={busy} onClick={() => void run("PATCH", { mode: rule.mode === "live" ? "paper" : "live" })}>
          {rule.mode === "live" ? t("Back to paper") : t("Go live")}
        </Button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => void run("DELETE")} aria-label={t("Delete {name}", { name: rule.name })}>
          <Trash2 size={12} aria-hidden />
          {t("Delete")}
        </Button>
        {!rule.enabled && <span className="type-label text-text-muted">{t("Off")}</span>}
      </div>
      <Problem text={error} />
    </li>
  );
}

function NewRule({ data, feed, handoff }: { data: AutomationResponse; feed: AutomationFeed; handoff: RuleHandoff | null }) {
  const t = useT();
  /* A backtest's handoff is used only when its strategy is one rules run. */
  const carried = handoff !== null && data.strategies.some((entry) => entry.id === handoff.strategyId) ? handoff : null;
  const [form, setForm] = useState({
    name: "",
    side: "long",
    coin: carried?.coin ?? "BTC",
    interval: carried?.interval ?? "1h",
    strategyId: carried?.strategyId ?? data.strategies[0]?.id ?? "",
    sizeUsd: "50",
    leverage: "2",
    takeProfitPct: "3",
    stopLossPct: "1.5",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strategy = data.strategies.find((entry) => entry.id === form.strategyId);
  /* The backtest's parameters ride along while its strategy is still chosen. */
  const params = carried !== null && form.strategyId === carried.strategyId ? carried.params : null;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (carried !== null) formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [carried]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3 scroll-mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void feed
          .write("/api/automation/rules", "POST", {
            ...form,
            ...(params === null ? {} : { params }),
            sizeUsd: Number(form.sizeUsd),
            leverage: Number(form.leverage),
            takeProfitPct: Number(form.takeProfitPct),
            stopLossPct: Number(form.stopLossPct),
            mode: "paper",
          })
          .then((result) => {
            setError(result.error);
            if (result.error === null) setForm((current) => ({ ...current, name: "" }));
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="rule-name">{t("Name")}</Label>
        <input id="rule-name" className={field} value={form.name} onChange={set("name")} placeholder={t("BTC RSI dip")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rule-strategy">{t("Strategy")}</Label>
        <select id="rule-strategy" className={field} value={form.strategyId} onChange={set("strategyId")}>
          {data.strategies.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        {params !== null && (
          <p className="type-label text-accent">
            {t("From your backtest: {strategy} on {market}, {interval} bars, with the parameters you tested ({params}).", {
              strategy: strategy?.name ?? form.strategyId,
              market: marketLabel(form.coin),
              interval: form.interval,
              params: Object.entries(params).map(([key, value]) => `${key} ${value}`).join(", ") || "—",
            })}
          </p>
        )}
        {strategy !== undefined &&
          (form.side === "long" ? (
            <p className="type-label text-text-muted">
              {params === null
                ? t("Entry: {entry} Exit: {exit} Default parameters; test it in Research → Backtests first.", { entry: strategy.rules.entry, exit: strategy.rules.exit })
                : t("Entry: {entry} Exit: {exit}", { entry: strategy.rules.entry, exit: strategy.rules.exit })}
            </p>
          ) : (
            <p className="type-label text-text-muted">
              {t("Shorts run this rule on the price chart turned upside down: every rise is read as a fall, so “{value}” is taken with above and below swapped. Backtests are long-only, so a short rule has no backtest — run it on paper first.", { value: strategy.rules.entry.replace(/\.$/, "") })}
            </p>
          ))}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rule-side">{t("Side")}</Label>
        <select id="rule-side" className={field} value={form.side} onChange={set("side")}>
          <option value="long">{t("Long — buy, profit when it rises")}</option>
          <option value="short">{t("Short — sell, profit when it falls")}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-coin">{t("Market")}</Label>
          <select id="rule-coin" className={field} value={form.coin} onChange={set("coin")}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-interval">{t("Timeframe")}</Label>
          <select id="rule-interval" className={field} value={form.interval} onChange={set("interval")}>
            {AUTOTRADE_INTERVALS.map((interval) => (
              <option key={interval} value={interval}>
                {interval}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-size">{t("Size ($)")}</Label>
          <input id="rule-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-leverage">{t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}</Label>
          <input id="rule-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-tp">{t("Take-profit (%)")}</Label>
          <input id="rule-tp" inputMode="decimal" className={field} value={form.takeProfitPct} onChange={set("takeProfitPct")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-sl">{t("Stop-loss (%)")}</Label>
          <input id="rule-sl" inputMode="decimal" className={field} value={form.stopLossPct} onChange={set("stopLossPct")} />
        </div>
      </div>
      <p className="type-label text-text-muted">
        {t("Isolated margin. New rules start on paper; switch one to live from its row once it has earned it. Paper trades pay an estimated taker fee and slippage on every fill.")}
      </p>
      <div>
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          <Plus size={14} aria-hidden />
          {t("Add rule")}
        </Button>
      </div>
      <Problem text={error} />
    </form>
  );
}

/* ---- markets ---- */

const marketLabel = (coin: string) => marketFor(coin)?.label ?? coin;

/* ---- market orders: trade now, by hand ---- */

function MarketOrder({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const [form, setForm] = useState({ coin: "BTC", sizeUsd: "50", leverage: "2", takeProfitPct: "4", stopLossPct: "2", mode: "paper" });
  const [busy, setBusy] = useState<"long" | "short" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const liveReady = data.live.enabled && data.agent !== null && data.agent.approved && data.agent.network === data.live.network;
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const trade = (side: "long" | "short") => {
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
        mode: form.mode,
      })
      .then((result) => {
        setError(result.error);
        if (result.error === null) {
          setDone(
            t("{side} {market} opened ({mode}). It is under Trades.", {
              side: side === "long" ? t("Long") : t("Short"),
              market: marketLabel(form.coin),
              mode: form.mode === "live" ? t("live {network}", { network: data.live.network }) : t("paper"),
            }),
          );
        }
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="trade-coin">{t("Market")}</Label>
          <select id="trade-coin" className={field} value={form.coin} onChange={set("coin")}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="trade-size">{t("Size ($)")}</Label>
          <input id="trade-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="trade-leverage">{t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}</Label>
          <input id="trade-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="trade-tp">{t("Take-profit (%)")}</Label>
          <input id="trade-tp" inputMode="decimal" className={field} value={form.takeProfitPct} onChange={set("takeProfitPct")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="trade-sl">{t("Stop-loss (%)")}</Label>
          <input id="trade-sl" inputMode="decimal" className={field} value={form.stopLossPct} onChange={set("stopLossPct")} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="trade-mode">{t("Mode")}</Label>
          <select id="trade-mode" className={field} value={form.mode} onChange={set("mode")}>
            <option value="paper">{t("Paper")}</option>
            <option value="live" disabled={!liveReady}>
              {liveReady ? t("Live ({network})", { network: data.live.network }) : t("Live — not available")}
            </option>
          </select>
        </div>
      </div>
      <p className="type-label text-text-muted">
        {t("Opens at the market now, isolated margin, with the take-profit and stop-loss set from the fill and placed on Hyperliquid in the same request. Stock markets are trade[XYZ] perps — contracts that track the share price, not shares — and keep their own margin on Hyperliquid.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => trade("long")}>
          {busy === "long" ? t("Opening") : t("Long now")}
        </Button>
        <Button size="sm" variant="quiet" disabled={busy !== null} onClick={() => trade("short")}>
          {busy === "short" ? t("Opening") : t("Short now")}
        </Button>
      </div>
      {done !== null && (
        <p role="status" className="type-label text-positive">
          {done}
        </p>
      )}
      <Problem text={error} />
    </div>
  );
}

/* ---- limit orders ---- */

function OrderRow({ order, feed, now }: { order: OrderView; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-data-sm min-w-0 truncate text-text-primary">
          {t("{side} {coin} at {price}", { side: order.side === "long" ? t("Long") : t("Short"), coin: marketLabel(order.coin), price: formatPriceUsd(order.price) })}
        </span>
        <span className={cn("type-label shrink-0", order.status === "open" ? "text-text-primary" : "text-text-muted")}>
          {order.status === "open" ? t("Waiting") : order.status === "filled" ? t("Filled") : order.status === "cancelled" ? t("Cancelled") : t("Failed")}
        </span>
      </div>
      <span className="type-label text-text-muted">
        {t("{sizeUsd} at {leverage}x · TP {takeProfit} · SL {stopLoss} · {mode}", { sizeUsd: formatUsd(order.sizeUsd, { decimals: 0 }), leverage: order.leverage, takeProfit: formatPriceUsd(order.takeProfit), stopLoss: formatPriceUsd(order.stopLoss), mode: order.mode === "live" ? t("live {network}", { network: order.network ?? "" }).trim() : t("paper") })}
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

function LimitOrders({ data, feed, now }: { data: AutomationResponse; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const [form, setForm] = useState({ coin: "BTC", side: "long", price: "", sizeUsd: "50", leverage: "2", takeProfit: "", stopLoss: "", mode: "paper" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveReady = data.live.enabled && data.agent !== null && data.agent.approved && data.agent.network === data.live.network;
  const open = data.orders.filter((order) => order.status === "open");
  const past = data.orders.filter((order) => order.status !== "open").slice(0, 8);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const long = form.side === "long";

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
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
              mode: form.mode,
            })
            .then((result) => {
              setError(result.error);
              if (result.error === null) setForm((current) => ({ ...current, price: "", takeProfit: "", stopLoss: "" }));
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-coin">{t("Market")}</Label>
            <select id="order-coin" className={field} value={form.coin} onChange={set("coin")}>
              <MarketOptions />
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-side">{t("Side")}</Label>
            <select id="order-side" className={field} value={form.side} onChange={set("side")}>
              <option value="long">{t("Long")}</option>
              <option value="short">{t("Short")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-price">{t("Open at ($)")}</Label>
            <input id="order-price" inputMode="decimal" className={field} value={form.price} onChange={set("price")} placeholder={long ? t("Below the market") : t("Above the market")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-size">{t("Size ($)")}</Label>
            <input id="order-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-tp">{t("Take-profit ($)")}</Label>
            <input id="order-tp" inputMode="decimal" className={field} value={form.takeProfit} onChange={set("takeProfit")} placeholder={long ? t("Above the entry") : t("Below the entry")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-sl">{t("Stop-loss ($)")}</Label>
            <input id="order-sl" inputMode="decimal" className={field} value={form.stopLoss} onChange={set("stopLoss")} placeholder={long ? t("Below the entry") : t("Above the entry")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-leverage">{t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}</Label>
            <input id="order-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-mode">{t("Mode")}</Label>
            <select id="order-mode" className={field} value={form.mode} onChange={set("mode")}>
              <option value="paper">{t("Paper")}</option>
              <option value="live" disabled={!liveReady}>
                {liveReady ? t("Live ({network})", { network: data.live.network }) : t("Live — not available")}
              </option>
            </select>
          </div>
        </div>
        <p className="type-label text-text-muted">
          {t("A long waits below the current price and a short above it. Live orders rest on Hyperliquid and fill there even when Elyra is closed; the take-profit and stop-loss attach the moment it fills. Paper orders fill at the next five-minute check after the price trades through the level.")}
        </p>
        <div>
          <Button type="submit" size="sm" variant="accent" disabled={busy}>
            <Crosshair size={14} aria-hidden />
            {t("Place limit order")}
          </Button>
        </div>
        <Problem text={error} />
      </form>

      {(open.length > 0 || past.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {[...open, ...past].map((order) => (
              <OrderRow key={order.id} order={order} feed={feed} now={now} />
            ))}
          </ul>
          {open.some((order) => order.mode === "live") && (
            <p className="type-label text-text-muted">{t("Pausing automation does not cancel resting live orders — cancel them here.")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- paper trade analysis ---- */

const signedUsd = (value: number | null) => (value === null ? "—" : formatUsd(value, { sign: true }));
const percent = (value: number | null) => (value === null ? "—" : `${value.toFixed(0)}%`);

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-border-subtle bg-surface-base px-2.5 py-2">
      <span className="type-label text-text-muted">{label}</span>
      <span className={cn("type-data", tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-text-primary")}>{value}</span>
    </div>
  );
}

function GroupList({ title, groups }: { title: string; groups: GroupStats[] }) {
  const t = useT();
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="type-eyebrow text-text-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
        {groups.map((group) => (
          <li key={group.key} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 px-2.5 py-1.5">
            <span className="type-data-sm min-w-0 truncate text-text-primary">{t(group.label)}</span>
            <span className="type-label text-text-muted">{group.trades} {group.trades === 1 ? t("trade") : t("trades")}</span>
            <span className="type-data-sm text-text-secondary">{percent(group.winRate)}</span>
            <span className={cn("type-data-sm", group.netPnlUsd >= 0 ? "text-positive" : "text-negative")}>{signedUsd(group.netPnlUsd)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Analysis({ analysis }: { analysis: PaperAnalysis | null }) {
  const t = useT();
  if (analysis === null) {
    return (
      <p className="type-body-sm text-text-secondary">
        {t("No closed paper trades yet. Once some close, this shows your real win rate, which leverage pays and which bleeds, long against short, and the hours you trade best.")}
      </p>
    );
  }
  const { overall } = analysis;
  const pays = analysis.bestLeverage !== null && analysis.bestLeverage.netPnlUsd > 0 ? analysis.bestLeverage : null;
  const bleeds =
    analysis.worstLeverage !== null && analysis.worstLeverage.netPnlUsd < 0 && analysis.worstLeverage.key !== pays?.key ? analysis.worstLeverage : null;
  const sharpest = analysis.sharpestWindow !== null && analysis.sharpestWindow.netPnlUsd > 0 ? analysis.sharpestWindow : null;
  const hold =
    overall.avgHoldMinutes === null
      ? "—"
      : overall.avgHoldMinutes < 120
        ? `${Math.round(overall.avgHoldMinutes)} min`
        : `${(overall.avgHoldMinutes / 60).toFixed(1)} h`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 @[28rem]:grid-cols-3">
        <Stat label={t("Trades")} value={String(overall.trades)} />
        <Stat label={t("Win rate")} value={percent(overall.winRate)} />
        <Stat label={t("Net result")} value={signedUsd(overall.netPnlUsd)} tone={overall.netPnlUsd >= 0 ? "positive" : "negative"} />
        <Stat label={t("Profit factor")} value={overall.profitFactor === null ? "—" : overall.profitFactor.toFixed(2)} />
        <Stat label={t("Average win")} value={signedUsd(overall.avgWinUsd)} />
        <Stat label={t("Average loss")} value={signedUsd(overall.avgLossUsd)} />
        <Stat label={t("Best trade")} value={signedUsd(overall.bestUsd)} />
        <Stat label={t("Worst trade")} value={signedUsd(overall.worstUsd)} />
        <Stat label={t("Average hold")} value={hold} />
      </div>

      <ul className="flex flex-col gap-1.5">
        {pays !== null && (
          <li className="type-body-sm text-text-secondary">
            <span className="text-text-primary">{t("{label} pays:", { label: pays.label })}</span> {t("{netPnlUsd} over {trades} trades, {winRate} won.", { netPnlUsd: signedUsd(pays.netPnlUsd), trades: pays.trades, winRate: percent(pays.winRate) })}
          </li>
        )}
        {bleeds !== null && (
          <li className="type-body-sm text-text-secondary">
            <span className="text-text-primary">{t("{label} bleeds:", { label: bleeds.label })}</span> {t("{netPnlUsd} over {trades} trades, {winRate} won.", { netPnlUsd: signedUsd(bleeds.netPnlUsd), trades: bleeds.trades, winRate: percent(bleeds.winRate) })}
          </li>
        )}
        {sharpest !== null && (
          <li className="type-body-sm text-text-secondary">
            <span className="text-text-primary">{t("Sharpest timing:")}</span>{" "}{t("entries {label} — {winRate} won, {netPnlUsd} over {trades} trades.", { label: sharpest.label, winRate: percent(sharpest.winRate), netPnlUsd: signedUsd(sharpest.netPnlUsd), trades: sharpest.trades })}
          </li>
        )}
        {pays === null && bleeds === null && sharpest === null && (
          <li className="type-body-sm text-text-secondary">{t("No leverage band or time window has the five trades it takes to call it yet.")}</li>
        )}
      </ul>

      {analysis.smallSample && (
        <p className="type-label text-caution">{t("Fewer than 20 closed trades: treat every split below as noise until there are more.")}</p>
      )}

      <GroupList title={t("By leverage")} groups={analysis.byLeverage} />
      <GroupList title={t("Long vs short")} groups={analysis.bySide} />
      <GroupList title={t("By entry time")} groups={analysis.byWindow} />
      <GroupList title={t("By exit")} groups={analysis.byExit} />
      <GroupList title={t("By market")} groups={analysis.byCoin.map((group) => ({ ...group, label: marketLabel(group.key) }))} />
      <p className="type-label text-text-muted">
        {t("Paper trades only, after estimated fees and slippage. Win rate counts a trade as a win when it closed above zero after costs.")}
      </p>
    </div>
  );
}

/* ---- trades ---- */

const EXIT_WORDS: Record<string, string> = {
  take_profit: msg("Take-profit"),
  stop_loss: msg("Stop-loss"),
  exit_rule: msg("Exit rule"),
  closed_outside_elyra: msg("Closed outside Elyra"),
  closed_by_hand: msg("Closed by you"),
};

function TradeRow({ trade, feed, now }: { trade: TradeView; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  const pnl = trade.realisedPnlUsd;
  const [note, setNote] = useState<string | null>(null);
  return (
    <li className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-data-sm truncate text-text-primary">
          {marketLabel(trade.coin)} {trade.side} · {trade.ruleName}
          <span className="text-text-muted"> · {trade.mode === "live" ? t("live {value}", { value: trade.network ?? "" }) : t("paper")}</span>
        </span>
        {pnl !== null ? (
          <span className={cn("type-data-sm shrink-0", pnl >= 0 ? "text-positive" : "text-negative")}>{formatUsd(pnl, { sign: true })}</span>
        ) : (
          <span className="type-label shrink-0 text-text-muted">{trade.status === "failed" ? t("Failed") : trade.status === "opening" ? t("Opening") : t("Open")}</span>
        )}
      </div>
      <span className="type-label text-text-muted">
        {t("In {entryPrice} · TP {takeProfit} · SL {stopLoss}", { entryPrice: formatPriceUsd(trade.entryPrice), takeProfit: formatPriceUsd(trade.takeProfit), stopLoss: formatPriceUsd(trade.stopLoss) })}
        {trade.exitPrice !== null && <>{" "}{t("· out {exitPrice} ({reason})", { exitPrice: formatPriceUsd(trade.exitPrice), reason: t(EXIT_WORDS[trade.exitReason ?? ""] ?? trade.exitReason ?? "") })}</>}
        {now !== null && <> · {formatRelativeTime(trade.openedAt, now, t.locale)}</>}
      </span>
      {trade.error !== null && <span className="type-label text-negative">{trade.error}</span>}
      {/* Closing in part or whole, and moving the exits: the same controls as the chart's trade panel. */}
      {trade.status === "open" && <PositionControls trade={trade} write={feed.write} onNote={setNote} />}
      {trade.status !== "open" && trade.expectedPrice !== null && trade.expectedPrice !== undefined && <FillReport trade={trade} />}
      <Problem text={note} />
      {trade.status === "closed" && (
        <span>
          <Link
            href={`/arena?tab=reviews&trade=${trade.id}`}
            className="type-label text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {t("Review")}
          </Link>
        </span>
      )}
    </li>
  );
}

export function AutomationView({ handoff = null }: { handoff?: RuleHandoff | null }) {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useAutomation();
  const now = useMinute();

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) {
    return (
      <DrawerCard icon={Bot} title={t("Status")}>
        <SkeletonRows rows={4} />
      </DrawerCard>
    );
  }
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Bot}
        title={t("Sign in to automate trading")}
        body={t("Set rules once and Elyra checks them every five minutes, entering with take-profit and stop-loss attached.")}
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            {t("Sign in")}
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) {
    return <EmptyState icon={Bot} title={t("Automation is unavailable")} body={feed.error ?? t("It will try again shortly.")} />;
  }

  return (
    <>
      <StatusCard data={data} feed={feed} />
      <KeyCard data={data} feed={feed} />
      <DrawerCard icon={ListChecks} title={t("Rules")} right={<span className="type-label text-text-muted">{t("{count} of {maxRulesPerAccount}", { count: data.rules.length, maxRulesPerAccount: LIMITS.maxRulesPerAccount })}</span>}>
        {data.rules.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No rules yet. Add one below — it starts on paper.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} data={data} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </DrawerCard>
      <DrawerCard icon={Plus} title={t("New rule")}>
        <NewRule key={handoff === null ? "blank" : JSON.stringify(handoff)} data={data} feed={feed} handoff={handoff} />
      </DrawerCard>
      <DrawerCard icon={Zap} title={t("Trade now")}>
        <MarketOrder data={data} feed={feed} />
      </DrawerCard>
      <DrawerCard icon={Crosshair} title={t("Limit orders")}>
        <LimitOrders data={data} feed={feed} now={now} />
      </DrawerCard>
      <DrawerCard icon={History} title={t("Trades")}>
        {data.trades.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("Nothing traded yet. Entries appear here as rules fire.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.trades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </DrawerCard>
      <DrawerCard icon={BarChart3} title={t("Paper trade analysis")}>
        <Analysis analysis={data.analysis} />
      </DrawerCard>
      <p className="type-label text-text-muted">
        {t("Automated trading can lose money quickly. Paper results estimate fees and slippage; live fills can be worse, and a price that gaps past a stop fills beyond it. Past results say nothing certain about future ones.")}
      </p>
    </>
  );
}
