"use client";

import { useState } from "react";
import { Bot, ListChecks, Sparkles, Trash2 } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { KeyCard } from "@/components/automation/KeyApproval";
import { OrderEntry } from "@/components/automation/OrderEntry";
import { Overview } from "@/components/automation/Overview";
import { ModeChip, Problem } from "@/components/automation/parts";
import { RuleEditor } from "@/components/automation/RuleEditor";
import { TradeRecord } from "@/components/automation/TradeRecord";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import type { RuleHandoff } from "@/lib/autotrade/handoff";
import { LIMITS } from "@/lib/autotrade/rules";
import type { AutomationResponse, RuleView, StrategyOption } from "@/lib/autotrade/types";
import { useAutomation, type AutomationFeed } from "@/lib/autotrade/useAutomation";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Trading automation: rules Elyra runs on Hyperliquid perps, and the trades
   a person places by hand through the same key — a market order now, or a
   limit order at a level — each with its take-profit and stop-loss.

   The drawer reads top to bottom as six views of one thing:
     1. Overview      — the engine's status, what this server can execute,
                        and the entry controls (components/automation/Overview)
     2. Trading key   — its own status, and the review before the wallet
                        signs (KeyApproval)
     3. Rules         — the person's rules, then a new one (RuleEditor)
     4. Order entry   — market and limit orders by hand (OrderEntry)
     5. Trade history — and
     6. its analysis  — computed from the same filtered trades (TradeRecord)

   Every rule is checked on each five-minute tick against its latest closed
   bar; an entry goes to Hyperliquid with its take-profit and stop-loss in the
   same request, so the exchange holds them between checks. Rules start on
   paper. Live needs the server switched to live AND Elyra's trading key
   approved from the person's own wallet — a key that can trade and cannot
   withdraw.
--------------------------------------------------------------------------- */

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
  const askElyra = useElyraStore((state) => state.askElyra);
  /* Questions about a rule's own record are worth asking once it has one. */
  const traded = data.trades.some((trade) => trade.ruleId === rule.id && trade.status === "closed");
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
          <span className="type-label tabular-nums text-text-muted">{ruleSummary(rule, data.strategies, t)}</span>
        </div>
        <ModeChip mode={rule.mode} />
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
      {traded && (
        /* Fills the composer, in the reader's language; nothing is sent until they press send. */
        <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
          <Button size="xs" variant="ghost" onClick={() => askElyra(t("How much capital has my {name} rule needed, and what has it returned?", { name: rule.name }))}>
            <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {t("Ask about its capital and return")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => askElyra(t("What would have happened to my {name} trades without the stop-loss?", { name: rule.name }))}>
            <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {t("Ask what happens without its stop")}
          </Button>
        </div>
      )}
      <Problem text={error} />
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
      <DrawerCard icon={Bot} title={t("Overview")}>
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
      <Overview data={data} feed={feed} />
      <KeyCard data={data} feed={feed} />
      <DrawerCard
        icon={ListChecks}
        title={t("Rules")}
        right={<span className="type-label tabular-nums text-text-muted">{t("{count} of {maxRulesPerAccount}", { count: data.rules.length, maxRulesPerAccount: LIMITS.maxRulesPerAccount })}</span>}
      >
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
      <RuleEditor key={handoff === null ? "blank" : JSON.stringify(handoff)} data={data} feed={feed} handoff={handoff} />
      <OrderEntry data={data} feed={feed} now={now} />
      <TradeRecord data={data} feed={feed} now={now} />
      <p className="type-label text-text-muted">
        {t("Automated trading can lose money quickly. Paper results estimate fees and slippage; live fills can be worse, and a price that gaps past a stop fills beyond it. Past results say nothing certain about future ones.")}
      </p>
    </>
  );
}
