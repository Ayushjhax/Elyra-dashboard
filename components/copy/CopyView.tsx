"use client";

import { useState } from "react";
import { ChevronDown, Copy, FolderKanban, Plus, Users } from "lucide-react";
import { FollowForm, Problem, SetEditor } from "@/components/copy/CopyForms";
import { ModeTag, Spark } from "@/components/funds/parts";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { DeltaText, ValueTone } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RuleMode } from "@/lib/autotrade/rules";
import type { LeaderRecord } from "@/lib/copy/rules";
import type { CopyResponse, FollowView, LeaderSummary, MySetView } from "@/lib/copy/types";
import { useCopy, useLeader, type CopyFeed } from "@/lib/copy/useCopy";
import { formatPct, formatPriceUsd, formatRelativeTime, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Copy trading: copy a rule set someone shares — or one of Elyra's own —
   into your own account, and share sets of your own rules.

   A leader is shown by its owner's Arena handle or as Elyra's, never by a
   wallet, and its record is in returns on margin, never in dollars. Elyra's
   own sets are machine-run, so they carry the agent layer's lime rail
   (brand doc 1.3); a person's do not. A backtest is always labelled as
   one, beside the real record, never in its place.
--------------------------------------------------------------------------- */

/** A house leader's name and description are English in code; a person's are their own words. */
function leaderText(t: Translator, leader: Pick<LeaderSummary, "house" | "name" | "description">) {
  return leader.house ? { name: t(leader.name), description: t(leader.description) } : { name: leader.name, description: leader.description };
}

function Modes({ modes }: { modes: RuleMode[] }) {
  return (
    <span className="flex items-center gap-1">
      {modes.map((mode) => (
        <ModeTag key={mode} mode={mode} />
      ))}
    </span>
  );
}

function Owner({ leader }: { leader: Pick<LeaderSummary, "house" | "handle"> }) {
  const t = useT();
  return leader.house ? (
    <span className="type-eyebrow inline-flex h-5 items-center rounded-chip border border-agent-rail px-1.5 text-agent-accent">{t("By Elyra")}</span>
  ) : (
    <span className="type-label text-text-secondary">@{leader.handle}</span>
  );
}

/** Trades, wins and the summed return, in one line. */
function RecordLine({ record }: { record: LeaderRecord }) {
  const t = useT();
  if (record.trades === 0) return <span className="type-label text-text-muted">{t("No closed trades yet")}</span>;
  return (
    <span className="type-label flex flex-wrap items-baseline gap-x-1.5 text-text-secondary">
      <span>{record.trades === 1 ? t("1 trade") : t("{count} trades", { count: record.trades })}</span>
      <span aria-hidden>·</span>
      <span>{t("{pct} won", { pct: formatPct((record.wins / record.trades) * 100, { decimals: 0, sign: false }) })}</span>
      <span aria-hidden>·</span>
      <DeltaText value={record.totalReturnPct} className="type-data-sm" />
    </span>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className="type-data-sm text-text-primary">{children}</span>
    </div>
  );
}

function RecordGrid({ record }: { record: LeaderRecord }) {
  const t = useT();
  const pct = (value: number | null) => (value === null ? "—" : <ValueTone value={value}>{formatPct(value)}</ValueTone>);
  return (
    <div className="grid grid-cols-4 gap-2 @max-[360px]:grid-cols-2">
      <Metric label={t("Trades")}>{record.trades}</Metric>
      <Metric label={t("Won")}>{record.trades === 0 ? "—" : formatPct((record.wins / record.trades) * 100, { decimals: 0, sign: false })}</Metric>
      <Metric label={t("Average")}>{pct(record.avgReturnPct)}</Metric>
      <Metric label={t("Summed")}>{record.trades === 0 ? "—" : pct(record.totalReturnPct)}</Metric>
    </div>
  );
}

const exitLabel = (t: Translator, reason: string | null) =>
  reason === "take_profit"
    ? t("target")
    : reason === "stop_loss"
      ? t("stop")
      : reason === "exit_rule"
        ? t("exit rule")
        : reason === "closed_by_hand"
          ? t("by hand")
          : reason === null
            ? null
            : t("closed");

function LeaderDetailPanel({ id }: { id: string }) {
  const t = useT();
  const feed = useLeader(id);
  const now = useMinute();
  const detail = feed.data;
  if (detail === null) {
    return feed.error !== null ? <p className="type-label text-text-muted">{feed.error}</p> : <SkeletonRows rows={3} />;
  }
  const { leader, trades, backtest } = detail;
  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
      <section className="flex flex-col gap-1.5">
        <h4 className="type-eyebrow text-text-muted">{t("Its rules")}</h4>
        <ul className="flex flex-col gap-1">
          {leader.rules.map((rule, index) => (
            <li key={index} className="type-label flex flex-wrap items-baseline justify-between gap-x-3 text-text-secondary">
              <span className="text-text-primary">
                {t("{coin} {side} · {interval}", { coin: rule.coin, side: rule.side === "long" ? t("long") : t("short"), interval: rule.interval })}
              </span>
              <span>
                {t(rule.strategyName)} · {t("TP {takeProfitPct}% · SL {stopLossPct}% · {leverage}x", { takeProfitPct: rule.takeProfitPct, stopLossPct: rule.stopLossPct, leverage: rule.leverage })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="type-eyebrow text-text-muted">{t("Its record")}</h4>
        <RecordGrid record={leader.record} />
        <p className="type-label text-text-muted">
          {t("Every closed trade since the set was made, each as a return on its own margin, summed without compounding. Your result is your size times these, less your own fills.")}
        </p>
      </section>

      {backtest !== null && (
        <section className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-base p-2.5">
          <h4 className="type-eyebrow text-text-muted">{t("Backtest · not traded")}</h4>
          <RecordGrid record={backtest.record} />
          <ul className="flex flex-col gap-0.5">
            {backtest.perRule.map((entry, index) => (
              <li key={index} className="type-label flex items-baseline justify-between gap-3 text-text-secondary">
                <span>{t("{coin} {side} · {interval}", { coin: entry.coin, side: entry.side === "long" ? t("long") : t("short"), interval: entry.interval })}</span>
                <span className="flex items-baseline gap-1.5">
                  {t("{count} trades in {days} days", { count: entry.trades, days: entry.days })}
                  <DeltaText value={entry.totalReturnPct} className="type-data-sm" />
                </span>
              </li>
            ))}
          </ul>
          <p className="type-label text-text-muted">
            {t("Its rules replayed on Hyperliquid's own bars over the last {days} days, with fees and slippage, as the five-minute check would have traded them. Hypothetical: past bars say nothing certain about the next ones.", { days: backtest.days })}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h4 className="type-eyebrow text-text-muted">{t("Latest trades")}</h4>
        {trades.length === 0 ? (
          <p className="type-label text-text-muted">{t("Nothing yet. Its rules enter when their strategy does; a copy starts with the next entry.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {trades.map((trade) => (
              <li key={trade.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="type-body-sm text-text-primary">
                    {t("{coin} {side}", { coin: trade.coin, side: trade.side === "long" ? t("long") : t("short") })}{" "}
                    <span className="type-label text-text-muted">
                      {t("at {price}", { price: formatPriceUsd(trade.entryPrice) })}
                      {trade.exitPrice !== null && ` → ${formatPriceUsd(trade.exitPrice)}`}
                      {exitLabel(t, trade.exitReason) !== null && ` · ${exitLabel(t, trade.exitReason)}`}
                    </span>
                  </span>
                  {now !== null && <span className="type-label text-text-muted">{formatRelativeTime(trade.closedAt ?? trade.openedAt, now, t.locale)}</span>}
                </span>
                {trade.returnPct === null ? (
                  <span className="type-label shrink-0 text-accent">{t("Open")}</span>
                ) : (
                  <DeltaText value={trade.returnPct} className="type-data-sm shrink-0" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LeaderRow({ leader, data, feed }: { leader: LeaderSummary; data: CopyResponse; feed: CopyFeed<CopyResponse> }) {
  const t = useT();
  const auth = useElyraAuth();
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const text = leaderText(t, leader);
  const following = leader.followId !== null;
  const coins = [...new Set(leader.rules.map((rule) => `${rule.coin} ${rule.side === "long" ? t("long") : t("short")}`))];

  return (
    <li className="relative flex flex-col gap-2 py-3">
      {/* Elyra's own set is machine-run: the agent layer's rail, at the card's inner edge, moving nothing. */}
      {leader.house && <span aria-hidden className="absolute -left-4 bottom-3 top-3 w-0.5 bg-agent-rail @max-[340px]:-left-3" />}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{text.name}</span>
            <Owner leader={leader} />
            <Modes modes={leader.modes} />
          </div>
          <span className="type-label truncate text-text-muted">{coins.join(" · ")}</span>
          <RecordLine record={leader.record} />
          <span className="type-label text-text-muted">
            {leader.followers === 1 ? t("1 person copies it") : t("{count} people copy it", { count: leader.followers })}
            {leader.open > 0 && ` · ${leader.open === 1 ? t("1 position open") : t("{count} positions open", { count: leader.open })}`}
          </span>
        </div>
        <Spark values={leader.record.curve} className="mt-1 @max-[400px]:hidden" />
      </div>
      {!open && text.description !== "" && <p className="type-label line-clamp-2 text-text-secondary">{text.description}</p>}
      {open && text.description !== "" && <p className="type-label text-text-secondary">{text.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={14} aria-hidden className={cn("transition-transform duration-[var(--dur-base)] ease-brand", open && "rotate-180")} />
          {open ? t("Less") : t("Record and rules")}
        </Button>
        <span className="ml-auto" />
        {leader.mine ? (
          <span className="type-label text-text-muted">{t("Your set")}</span>
        ) : following ? (
          <span className="type-label text-accent">{t("You copy it")}</span>
        ) : !auth.ready || !feed.signedIn ? (
          <Button size="sm" variant="quiet" onClick={auth.login}>
            {t("Sign in to copy")}
          </Button>
        ) : (
          !copying && (
            <Button size="sm" variant="accent" onClick={() => setCopying(true)}>
              <Copy size={14} aria-hidden />
              {t("Copy")}
            </Button>
          )
        )}
      </div>
      {copying && <FollowForm leaderId={leader.id} leaderName={text.name} live={data.live} feed={feed} onDone={() => setCopying(false)} />}
      {open && <LeaderDetailPanel id={leader.id} />}
    </li>
  );
}

function FollowRow({ follow, data, feed }: { follow: FollowView; data: CopyResponse; feed: CopyFeed<CopyResponse> }) {
  const t = useT();
  const now = useMinute();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = follow.leaderName === "" ? t("A set no longer shared") : follow.leaderHouse ? t(follow.leaderName) : follow.leaderName;

  const send = async (method: "PATCH" | "DELETE", body?: unknown) => {
    setError(null);
    const result = await feed.write(`/api/copy/follows/${follow.id}`, method, body);
    if (result.error !== null) setError(result.error);
  };

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{name}</span>
            <ModeTag mode={follow.mode} />
            {!follow.enabled && <span className="type-eyebrow text-caution">{t("Paused")}</span>}
          </span>
          <span className="type-label text-text-muted">
            {t("{size} a trade · up to {maxLeverage}x · {maxDriftPct}% allowance", {
              size: formatUsd(follow.sizeUsd, { decimals: 0 }),
              maxLeverage: follow.maxLeverage,
              maxDriftPct: follow.maxDriftPct,
            })}
          </span>
          <span className="type-label text-text-secondary">
            {t("{open} open · {closed} closed", { open: follow.openCopies, closed: follow.closedCopies })}
            {follow.closedCopies > 0 && (
              <>
                {" · "}
                <ValueTone value={follow.realisedUsd}>{formatUsd(follow.realisedUsd, { sign: true })}</ValueTone>
              </>
            )}
          </span>
        </div>
      </div>
      {follow.lastNote !== null && (
        <p className="type-label text-text-muted">
          {follow.lastNote}
          {follow.lastCheckedAt !== null && now !== null && ` · ${formatRelativeTime(follow.lastCheckedAt, now, t.locale)}`}
        </p>
      )}
      {!follow.leaderShared && <p className="type-label text-caution">{t("The leader no longer shares this set, so nothing new is copied.")}</p>}
      {editing ? (
        <FollowForm leaderId={follow.leaderId} leaderName={name} live={data.live} initial={follow} feed={feed} onDone={() => setEditing(false)} />
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-2.5">
          <p className="type-label text-text-secondary">{t("Stop copying? Nothing new is copied. Copies already open keep their take-profit and stop-loss and still close when the leader closes.")}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("Keep copying")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => void send("DELETE")}>
              {t("Stop copying")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="quiet" onClick={() => void send("PATCH", { enabled: !follow.enabled })}>
            {follow.enabled ? t("Pause") : t("Resume")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t("Change")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="ml-auto">
            {t("Stop")}
          </Button>
        </div>
      )}
      <Problem text={error} />
    </li>
  );
}

function SetRow({ set, mine, feed }: { set: MySetView; mine: NonNullable<CopyResponse["mine"]>; feed: CopyFeed<CopyResponse> }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <li className="py-3">
        <SetEditor rules={mine.rules} sets={mine.sets} handle={mine.handle} initial={set} feed={feed} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{set.name}</span>
        <span className={cn("type-eyebrow", set.published ? "text-accent" : "text-text-muted")}>{set.published ? t("Shared") : t("Private")}</span>
      </div>
      <span className="type-label text-text-muted">
        {set.ruleIds.length === 1 ? t("1 rule") : t("{count} rules", { count: set.ruleIds.length })}
        {set.published && ` · ${set.followers === 1 ? t("1 person copies it") : t("{count} people copy it", { count: set.followers })}`}
      </span>
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-2.5">
          <p className="type-label text-text-secondary">{t("Delete this set? Its rules stay as they are. Anyone copying it stops getting new entries.")}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("Keep it")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                const result = await feed.write(`/api/copy/sets/${set.id}`, "DELETE");
                if (result.error !== null) setError(result.error);
              }}
            >
              {t("Delete set")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
            {t("Change")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="ml-auto">
            {t("Delete")}
          </Button>
        </div>
      )}
      <Problem text={error} />
    </li>
  );
}

function YourSets({ mine, feed }: { mine: NonNullable<CopyResponse["mine"]>; feed: CopyFeed<CopyResponse> }) {
  const t = useT();
  const [making, setMaking] = useState(false);
  return (
    <DrawerCard
      icon={FolderKanban}
      title={t("Your rule sets")}
      right={
        !making && (
          <Button size="sm" variant="quiet" onClick={() => setMaking(true)}>
            <Plus size={14} aria-hidden />
            {t("New set")}
          </Button>
        )
      }
    >
      <p className="type-body-sm text-text-secondary">
        {t("Group your rules into sets, and share a set to let others copy it. A rule is in one set at most; it keeps trading as it does now.")}
      </p>
      {making && (
        <div className="mt-3">
          <SetEditor rules={mine.rules} sets={mine.sets} handle={mine.handle} feed={feed} onDone={() => setMaking(false)} />
        </div>
      )}
      {mine.sets.length > 0 && (
        <ul className="mt-1 flex flex-col divide-y divide-border-subtle">
          {mine.sets.map((set) => (
            <SetRow key={set.id} set={set} mine={mine} feed={feed} />
          ))}
        </ul>
      )}
    </DrawerCard>
  );
}

export function CopyView() {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useCopy();
  const data = feed.data;

  if (feed.loading && data === null) {
    return (
      <>
        <DrawerCard icon={Users} title={t("Leaders")}>
          <SkeletonRows rows={4} />
        </DrawerCard>
      </>
    );
  }
  if (data === null) {
    return (
      <>
        <EmptyState icon={Users} title={t("Copy trading is unavailable")} body={feed.error ?? t("It will try again shortly.")} />
      </>
    );
  }
  const mine = data.mine;

  return (
    <>
      <p className="type-body-sm px-1 text-text-secondary">
        {t("Copy a rule set someone shares, or one of Elyra's own. When its rules enter, Elyra opens the same trade in your account on the same five-minute check — at your size, with the leader's take-profit and stop-loss — and closes it when the leader closes. Your account's limits on Your rules apply to every copy.")}
      </p>

      {mine !== null && mine.follows.length > 0 && (
        <DrawerCard icon={Copy} title={t("You copy")}>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {mine.follows.map((follow) => (
              <FollowRow key={follow.id} follow={follow} data={data} feed={feed} />
            ))}
          </ul>
        </DrawerCard>
      )}

      <DrawerCard icon={Users} title={t("Leaders")} right={<span className="type-label text-text-muted">{t("{count} shared", { count: data.leaders.length })}</span>}>
        {data.error !== null && <Problem text={data.error} />}
        {data.leaders.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No sets are shared yet.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.leaders.map((leader) => (
              <LeaderRow key={leader.id} leader={leader} data={data} feed={feed} />
            ))}
          </ul>
        )}
      </DrawerCard>

      {mine !== null ? (
        <YourSets mine={mine} feed={feed} />
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={t("Share your own rules")}
          body={t("Sign in to group your automation rules into sets and let others copy them, shown by your Arena handle and never your wallet.")}
          action={
            <Button size="sm" variant="accent" onClick={auth.login}>
              {t("Sign in")}
            </Button>
          }
        />
      )}

      {!data.live.enabled && (
        <p className="type-label px-1 text-text-muted">
          {t("This server trades paper only, so every copy runs on paper. Live copying is switched on by the deployment (Hyperliquid {network}).", { network: data.live.network })}
        </p>
      )}
      <p className="type-label px-1 text-text-muted">
        {t("Copying a leader is not advice, and no leader is vetted by Elyra. A copy fills later than the leader and at its own price, live fills can be worse than paper, and past results say nothing certain about future ones.")}
      </p>
    </>
  );
}
