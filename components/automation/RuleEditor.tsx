"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { Divider, Field, Pair, Problem, Subhead, field, marketLabel } from "@/components/automation/parts";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import type { RuleHandoff } from "@/lib/autotrade/handoff";
import { AUTOTRADE_INTERVALS, LIMITS } from "@/lib/autotrade/rules";
import type { AutomationResponse } from "@/lib/autotrade/types";
import type { AutomationFeed } from "@/lib/autotrade/useAutomation";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   A new rule. Name, then the strategy with its own rules — entry and exit,
   in the strategy catalogue's words (lib/backtest/strategies.ts), the same
   text the backtest shows — then the market and the trade's terms, related
   fields paired. Every rule is created on paper; the server validates it
   (validateRule) and a refusal is shown with everything entered still there.
   A backtest's "Run on paper" only fills this form (lib/autotrade/handoff.ts).
--------------------------------------------------------------------------- */

export function RuleEditor({ data, feed, handoff }: { data: AutomationResponse; feed: AutomationFeed; handoff: RuleHandoff | null }) {
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
  const [created, setCreated] = useState<string | null>(null);
  const strategy = data.strategies.find((entry) => entry.id === form.strategyId);
  /* The backtest's parameters ride along while its strategy is still chosen. */
  const params = carried !== null && form.strategyId === carried.strategyId ? carried.params : null;
  const full = data.rules.length >= LIMITS.maxRulesPerAccount;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (carried !== null) formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [carried]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setCreated(null);
  };

  return (
    <DrawerCard icon={Plus} title={t("New rule")}>
      <form
        ref={formRef}
        className="flex scroll-mt-4 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setCreated(null);
          const name = form.name;
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
              /* A refusal keeps every value as entered, to be corrected in place. */
              setError(result.error);
              if (result.error === null) {
                setForm((current) => ({ ...current, name: "" }));
                setCreated(name.trim() || t("Your rule"));
              }
            })
            .finally(() => setBusy(false));
        }}
      >
        <p className="type-body-sm text-text-secondary">{t("Rules start on paper. Switch one to live from its row once it has earned it.")}</p>

        <Field id="rule-name" label={t("Name")}>
          <input id="rule-name" className={field} value={form.name} onChange={set("name")} placeholder={t("BTC RSI dip")} autoComplete="off" />
        </Field>

        <Divider />

        <section aria-labelledby="rule-strategy-head" className="flex flex-col gap-3">
          <Subhead id="rule-strategy-head" title={t("Strategy")}>
            {t("Choose how Elyra trades this rule.")}
          </Subhead>
          <Field id="rule-strategy" label={t("Strategy")}>
            <select id="rule-strategy" className={field} value={form.strategyId} onChange={set("strategyId")} aria-describedby="rule-strategy-rules">
              {data.strategies.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {t(entry.name)}
                </option>
              ))}
            </select>
          </Field>
          {/* The chosen strategy's own rules, right under it. */}
          {strategy !== undefined && (
            <div id="rule-strategy-rules" className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
              {form.side === "long" ? (
                <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                  <dt className="type-label text-text-muted">{t("Entry")}</dt>
                  <dd className="type-label text-text-primary">{t(strategy.rules.entry)}</dd>
                  <dt className="type-label text-text-muted">{t("Exit")}</dt>
                  <dd className="type-label text-text-primary">{t(strategy.rules.exit)}</dd>
                </dl>
              ) : (
                <p className="type-label text-text-primary">
                  {t("Shorts run this rule on the price chart turned upside down: every rise is read as a fall, so “{value}” is taken with above and below swapped. Backtests are long-only, so a short rule has no backtest — run it on paper first.", { value: t(strategy.rules.entry).replace(/\.$/, "") })}
                </p>
              )}
              {params !== null ? (
                <p className="type-label text-accent">
                  {t("From your backtest: {strategy} on {market}, {interval} bars, with the parameters you tested ({params}).", {
                    strategy: t(strategy.name),
                    market: marketLabel(form.coin),
                    interval: form.interval,
                    params: Object.entries(params).map(([key, value]) => `${key} ${value}`).join(", ") || "—",
                  })}
                </p>
              ) : (
                form.side === "long" && <p className="type-label text-text-muted">{t("Default parameters; test it in Research → Backtests first.")}</p>
              )}
            </div>
          )}
        </section>

        <Divider />

        <section aria-labelledby="rule-terms-head" className="flex flex-col gap-3">
          <Subhead id="rule-terms-head" title={t("Market and terms")}>
            {t("What it trades, on which bars, and how much.")}
          </Subhead>
          {/* Side's choices are sentences, so it takes the whole row. */}
          <Field id="rule-side" label={t("Side")}>
            <select id="rule-side" className={field} value={form.side} onChange={set("side")}>
              <option value="long">{t("Long — buy, profit when it rises")}</option>
              <option value="short">{t("Short — sell, profit when it falls")}</option>
            </select>
          </Field>
          <Pair>
            <Field id="rule-coin" label={t("Market")}>
              <select id="rule-coin" className={field} value={form.coin} onChange={set("coin")}>
                <MarketOptions />
              </select>
            </Field>
            <Field id="rule-interval" label={t("Timeframe")}>
              <select id="rule-interval" className={field} value={form.interval} onChange={set("interval")}>
                {AUTOTRADE_INTERVALS.map((interval) => (
                  <option key={interval} value={interval}>
                    {interval}
                  </option>
                ))}
              </select>
            </Field>
          </Pair>
          <Pair>
            <Field id="rule-size" label={t("Size ($)")}>
              <input id="rule-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
            </Field>
            <Field id="rule-leverage" label={t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}>
              <input id="rule-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
            </Field>
          </Pair>
          <Pair>
            <Field id="rule-tp" label={t("Take-profit (% from entry)")}>
              <input id="rule-tp" inputMode="decimal" className={field} value={form.takeProfitPct} onChange={set("takeProfitPct")} />
            </Field>
            <Field id="rule-sl" label={t("Stop-loss (% from entry)")}>
              <input id="rule-sl" inputMode="decimal" className={field} value={form.stopLossPct} onChange={set("stopLossPct")} />
            </Field>
          </Pair>
          <p className="type-label text-text-muted">
            {t("Isolated margin. Paper trades pay an estimated taker fee and slippage on every fill.")}
          </p>
        </section>

        <Problem text={error} />
        {created !== null && (
          <p role="status" className="type-label text-positive">
            {t("{name} was created on paper. It is under Rules.", { name: created })}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Button type="submit" variant="accent" disabled={busy || full} className="w-full">
            <Plus size={15} aria-hidden />
            {busy ? t("Creating…") : t("Create paper rule")}
          </Button>
          {full && (
            <p className="type-label text-text-muted">
              {t("You have {count} rules, the most allowed. Delete one to add another.", { count: LIMITS.maxRulesPerAccount })}
            </p>
          )}
        </div>
      </form>
    </DrawerCard>
  );
}
