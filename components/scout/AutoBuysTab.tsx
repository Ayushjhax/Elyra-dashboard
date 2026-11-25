"use client";

import { useState } from "react";
import { Bot, History, Pause, Play, Plus, Trash2 } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Notice, Segmented } from "@/components/scout/parts";
import { LIMITS } from "@/lib/autotrade/rules";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { AUTOBUY_LIMITS, type SideChoice, type Trigger } from "@/lib/scout/autobuy";
import type { AutoBuysResponse, AutoBuyView } from "@/lib/scout/types";
import { useScoutFeed, type ScoutFeed } from "@/lib/scout/useScout";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Auto-buys: a rule opens a trade when code sees smart money crowd into a
   market, or an exchange officially announce a listing. Paper first; every
   order goes through the chart ticket's own path, with its take-profit and
   stop-loss sent with it. A read of a video or article never triggers one.
--------------------------------------------------------------------------- */

const FIELD = "type-body-sm h-9 w-full rounded-control border border-border-strong bg-surface-base px-2.5 text-text-primary tabular-nums";

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (next: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label truncate text-text-muted">{label}</span>
      <input type="number" inputMode="decimal" className={FIELD} value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RuleForm({ feed, coins, live }: { feed: ScoutFeed<AutoBuysResponse>; coins: string[]; live: boolean }) {
  const t = useT();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("smart_money");
  const [side, setSide] = useState<SideChoice>("long");
  const [picked, setPicked] = useState<string[]>([]);
  const [minWallets, setMinWallets] = useState(4);
  const [sizeUsd, setSizeUsd] = useState(100);
  const [leverage, setLeverage] = useState(2);
  const [takeProfitPct, setTakeProfitPct] = useState(6);
  const [stopLossPct, setStopLossPct] = useState(3);
  const [maxPerDay, setMaxPerDay] = useState(2);
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await feed.write("/api/scout/autobuys", "POST", {
      name: name.trim() === "" ? (trigger === "listing" ? t("Listing buyer") : t("Smart-money follower")) : name,
      trigger,
      side: trigger === "listing" ? "long" : side,
      coins: picked,
      minWallets,
      sizeUsd,
      leverage,
      takeProfitPct,
      stopLossPct,
      maxPerDay,
      mode,
    });
    setSaving(false);
    if (result.error !== null) setError(result.error);
    else setName("");
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-muted">{t("Name")}</span>
        <input className={FIELD} value={name} maxLength={AUTOBUY_LIMITS.maxName} onChange={(event) => setName(event.target.value)} placeholder={t("Smart-money follower")} />
      </label>
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-muted">{t("Trigger")}</span>
        <Segmented
          label={t("Trigger")}
          value={trigger}
          onChange={setTrigger}
          options={[
            ["smart_money", t("Smart money opens")],
            ["listing", t("Official listing")],
          ]}
        />
        <p className="type-label text-text-secondary">
          {trigger === "smart_money"
            ? t("Fires when at least the wallets you set, from the most profitable Hyperliquid traders, open the same side of a market within an hour. Once per market, side and day.")
            : t("Fires when Bybit, OKX or Upbit announces, in its own feed, a listing of a coin Hyperliquid trades. Only announcements from the last two hours; only buys.")}
        </p>
      </div>
      {trigger === "smart_money" && (
        <div className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Follow")}</span>
          <Segmented
            label={t("Follow")}
            value={side}
            onChange={setSide}
            options={[
              ["long", t("Longs")],
              ["short", t("Shorts")],
              ["both", t("Both")],
            ]}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-muted">{picked.length === 0 ? t("Markets: every crypto market Elyra trades") : t("Markets: {count} chosen", { count: picked.length })}</span>
        <div className="flex flex-wrap gap-1">
          {coins.map((coin) => (
            <button
              key={coin}
              type="button"
              aria-pressed={picked.includes(coin)}
              onClick={() => setPicked((current) => (current.includes(coin) ? current.filter((entry) => entry !== coin) : [...current, coin]))}
              className={cn("type-data-sm h-7 rounded-chip border px-2", picked.includes(coin) ? "border-accent bg-accent-quiet text-text-primary" : "border-border-subtle text-text-muted hover:text-text-primary")}
            >
              {coin}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 @[28rem]:grid-cols-3">
        {trigger === "smart_money" && <NumberField label={t("Wallets at least")} value={minWallets} onChange={setMinWallets} min={AUTOBUY_LIMITS.minWallets} max={AUTOBUY_LIMITS.maxWallets} step={1} />}
        <NumberField label={t("Size (USD)")} value={sizeUsd} onChange={setSizeUsd} min={LIMITS.minSizeUsd} max={LIMITS.maxSizeUsd} step={10} />
        <NumberField label={t("Leverage")} value={leverage} onChange={setLeverage} min={1} max={LIMITS.maxLeverage} step={1} />
        <NumberField label={t("Take-profit %")} value={takeProfitPct} onChange={setTakeProfitPct} min={LIMITS.minTakeProfitPct} max={LIMITS.maxTakeProfitPct} step={0.5} />
        <NumberField label={t("Stop-loss %")} value={stopLossPct} onChange={setStopLossPct} min={LIMITS.minStopLossPct} max={LIMITS.maxStopLossPct} step={0.5} />
        <NumberField label={t("Trades a day at most")} value={maxPerDay} onChange={setMaxPerDay} min={1} max={AUTOBUY_LIMITS.maxPerDay} step={1} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-muted">{t("Account")}</span>
        <Segmented
          label={t("Account")}
          value={mode}
          onChange={(next) => setMode(next === "live" && !live ? "paper" : next)}
          options={[
            ["paper", t("Paper")],
            ["live", t("Live")],
          ]}
        />
        {!live && <p className="type-label text-text-muted">{t("Live trading is switched off on this server, so rules run on paper.")}</p>}
      </div>
      {error !== null && <Notice tone="negative">{error}</Notice>}
      <div>
        <Button variant="accent" onClick={() => void save()} disabled={saving || !feed.signedIn}>
          <Plus size={14} aria-hidden /> {t("Add rule")}
        </Button>
      </div>
    </div>
  );
}

function RuleRow({ rule, feed }: { rule: AutoBuyView; feed: ScoutFeed<AutoBuysResponse> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const act = (url: string, method: "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true);
    void feed.write(url, method, body).finally(() => setBusy(false));
  };
  const what =
    rule.trigger === "smart_money"
      ? t("When {wallets}+ smart-money wallets open {side}", { wallets: rule.minWallets, side: rule.side === "both" ? t("either side") : rule.side === "long" ? t("longs") : t("shorts") })
      : t("When an exchange officially announces a listing");
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{rule.name}</span>
        <span className={cn("type-eyebrow shrink-0", rule.status === "active" ? "text-positive" : "text-text-muted")}>
          {rule.status === "active" ? t("On") : t("Paused")} · {rule.mode === "live" ? t("Live") : t("Paper")}
        </span>
      </div>
      <span className="type-label text-text-secondary">{what}</span>
      <span className="type-label text-text-muted">
        {t("${size} at {leverage}x · take-profit {tp}% · stop-loss {sl}% · {used} of {max} today", {
          size: rule.sizeUsd,
          leverage: rule.leverage,
          tp: rule.takeProfitPct,
          sl: rule.stopLossPct,
          used: rule.firedToday,
          max: rule.maxPerDay,
        })}
        {rule.coins.length > 0 && ` · ${rule.coins.join(", ")}`}
      </span>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="xs" variant="quiet" disabled={busy} onClick={() => act(`/api/scout/autobuys/${rule.id}`, "PATCH", { status: rule.status === "active" ? "paused" : "active" })}>
          {rule.status === "active" ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          {rule.status === "active" ? t("Pause") : t("Resume")}
        </Button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(`/api/scout/autobuys/${rule.id}`, "DELETE")} aria-label={t("Delete {name}", { name: rule.name })}>
          <Trash2 size={12} aria-hidden /> {t("Delete")}
        </Button>
      </div>
    </li>
  );
}

export function AutoBuysTab() {
  const t = useT();
  const now = useMinute();
  const feed = useScoutFeed<AutoBuysResponse>("/api/scout/autobuys", { needsAuth: true, pollMs: 60_000 });
  const data = feed.data;

  if (feed.ready && !feed.signedIn) return <Notice>{t("Sign in to set up auto-buys.")}</Notice>;

  return (
    <>
      <DrawerCard icon={Bot} title={t("Auto-buys")}>
        <div className="flex flex-col gap-3">
          <p className="type-body-sm text-text-secondary">
            {t("A rule opens a trade when code sees a signal: smart money crowding into a market, or an exchange's own listing announcement. Paper unless you choose live. Every order goes through the chart ticket's own path, with its take-profit and stop-loss, your account limits and your daily loss limit. A video or article you read never triggers a trade.")}
          </p>
          {feed.error !== null && <Notice tone="negative">{feed.error}</Notice>}
          {data?.error && <Notice tone="caution">{data.error}</Notice>}
          {feed.loading && data === null ? (
            <SkeletonRows rows={3} />
          ) : data === null || data.error !== null ? null : data.rules.length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("No rules yet.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {data?.rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} feed={feed} />
              ))}
            </ul>
          )}
        </div>
      </DrawerCard>

      {/* No form while the rules cannot be read: a rule could not be saved either. */}
      {data !== null && data.error === null && data.rules.length < AUTOBUY_LIMITS.maxRules && (
        <DrawerCard icon={Plus} title={t("New rule")}>
          <RuleForm feed={feed} coins={data?.coins ?? []} live={data?.live ?? false} />
        </DrawerCard>
      )}

      <DrawerCard icon={History} title={t("What the rules did")}>
        {(data?.fires ?? []).length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("Nothing yet. The rules are checked every five minutes.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data?.fires.map((fire) => (
              <li key={fire.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="type-body-sm text-text-primary">
                    {fire.coin} <span className={fire.side === "long" ? "text-positive" : "text-negative"}>{fire.side === "long" ? t("long") : t("short")}</span>
                  </span>
                  <span className={cn("type-eyebrow", fire.outcome === "opened" ? "text-positive" : "text-caution")}>{fire.outcome === "opened" ? t("Opened") : t("Not opened")}</span>
                </div>
                <span className="type-label text-text-secondary">{fire.reason}</span>
                <span className="type-label text-text-muted">
                  {fire.ruleName}
                  {now !== null && ` · ${formatRelativeTime(fire.at, now, t.locale)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DrawerCard>
    </>
  );
}
