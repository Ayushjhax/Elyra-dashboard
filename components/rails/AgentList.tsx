"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Link2 } from "lucide-react";
import { DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button, buttonVariants } from "@/components/ui/Button";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { MANDATE_KIND_LABEL, MANDATE_KINDS, type AgentWithMandate, type MandateKind, type RailsResponse } from "@/lib/rails/types";
import type { RailsFeed } from "@/lib/rails/useRails";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg, type Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Your agents: each live Elyra key, what its mandate lets it ask for, and
   today's use of it — with the controls to grant, change or revoke it.

   A key is made in Connections and can only read until a mandate is granted
   here: two steps, said as two. A mandate is checked by the server
   (validateMandate) and every change is recorded in the ledger.
--------------------------------------------------------------------------- */

/* Inputs take --border-strong (brand doc 1.3). Focus is the global
   :focus-visible ring (app/globals.css), which a utility cannot override —
   a ring here as well would draw two. */
export const railsField = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-strong bg-surface-base px-3",
  "text-text-primary placeholder:text-text-muted",
);

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

/** Connections' AI agents section, where keys are made. */
export const AGENT_KEYS_HREF = "/agent#agent-keys";

function MandateForm({ agent, feed, onDone }: { agent: AgentWithMandate; feed: RailsFeed; onDone: () => void }) {
  const t = useT();
  const current = agent.mandate;
  const [kinds, setKinds] = useState<MandateKind[]>(current?.kinds ?? ["swap", "payment_request"]);
  const [perIntent, setPerIntent] = useState(String(current?.perIntentUsd ?? 50));
  const [daily, setDaily] = useState(String(current?.dailyUsd ?? 200));
  const [assets, setAssets] = useState((current?.assets ?? []).join(", "));
  const [payees, setPayees] = useState((current?.payees ?? []).join("\n"));
  const [autoPerps, setAutoPerps] = useState(current?.autoPerps ?? false);
  const [livePerps, setLivePerps] = useState(current?.livePerps ?? false);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = agent.keyId.slice(0, 8);
  const toggle = (kind: MandateKind) => setKinds((list) => (list.includes(kind) ? list.filter((entry) => entry !== kind) : [...list, kind]));

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await feed.write("/api/rails/mandates", "POST", {
      keyId: agent.keyId,
      kinds,
      perIntentUsd: Number(perIntent),
      dailyUsd: Number(daily),
      assets: assets.trim().length === 0 ? null : assets,
      payees,
      autoPerps,
      livePerps,
      expiresInDays: days === "none" ? null : Number(days),
    });
    setBusy(false);
    if (result.error !== null) setError(result.error);
    else onDone();
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="type-label mb-1 text-text-secondary">{t("It may ask to")}</legend>
        {MANDATE_KINDS.map((kind) => (
          <label key={kind} className="type-body-sm flex items-center gap-2 text-text-primary">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={kinds.includes(kind)} onChange={() => toggle(kind)} />
            {t(MANDATE_KIND_LABEL[kind])}
          </label>
        ))}
      </fieldset>
      <div className="@container">
        <div className="grid grid-cols-1 gap-2 @[17.5rem]:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-secondary">{t("Per transaction ($)")}</span>
            <input id={`per-${id}`} inputMode="decimal" className={railsField} value={perIntent} onChange={(event) => setPerIntent(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-secondary">{t("Per day ($)")}</span>
            <input inputMode="decimal" className={railsField} value={daily} onChange={(event) => setDaily(event.target.value)} />
          </label>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-secondary">{t("Only these assets (optional)")}</span>
        <input className={railsField} value={assets} onChange={(event) => setAssets(event.target.value)} placeholder={t("Any — or e.g. SOL, USDC, BTC")} />
      </label>
      {kinds.includes("payment") && (
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">{t("Only these payees (optional, one Solana address a line)")}</span>
          <textarea
            rows={3}
            className={cn(railsField, "h-auto py-2 font-mono")}
            value={payees}
            onChange={(event) => setPayees(event.target.value)}
            placeholder={t("Any payee that passes sanctions screening")}
          />
        </label>
      )}
      {kinds.includes("perp_order") && (
        <div className="flex flex-col gap-1.5">
          <label className="type-body-sm flex items-start gap-2 text-text-primary">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={autoPerps} onChange={(event) => setAutoPerps(event.target.checked)} />
            <span>
              {t("Let perp orders inside these limits run without my review")}
              <span className="type-label block text-text-muted">{t("Through your Hyperliquid trading key, which can trade and cannot withdraw.")}</span>
            </span>
          </label>
          <label className="type-body-sm flex items-start gap-2 text-text-primary">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={livePerps} onChange={(event) => setLivePerps(event.target.checked)} />
            <span>
              {t("Allow live perp orders")}
              <span className="type-label block text-text-muted">{t("Otherwise they are paper only. Live also needs your trading key approved on Automation.")}</span>
            </span>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-secondary">{t("Ends")}</span>
        <select className={railsField} value={days} onChange={(event) => setDays(event.target.value)}>
          <option value="7">{t("In 7 days")}</option>
          <option value="30">{t("In 30 days")}</option>
          <option value="90">{t("In 90 days")}</option>
          <option value="none">{t("When I revoke it")}</option>
        </select>
      </label>
      <p className="type-label text-text-muted">
        {t("Swaps and payments always come to you to sign in your own wallet. Every payee is screened against the OFAC sanctions list. Saving replaces this agent’s current mandate and is recorded in your ledger.")}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={busy || kinds.length === 0} onClick={() => void save()}>
          {busy ? t("Saving") : current === null ? t("Grant mandate") : t("Save mandate")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
      </div>
      <Problem text={error} />
    </div>
  );
}

/** What a mandate lets an agent ask for, in a line. Proper nouns keep their capitals. */
const KIND_SHORT: Record<MandateKind, string> = {
  swap: msg("swap on Solana"),
  payment: msg("pay in USDC"),
  perp_order: msg("trade Hyperliquid perps"),
  payment_request: msg("ask to be paid"),
};

/** "ends in 27 days" — a mandate's end is ahead of it, which a relative-time label does not say. */
function endsIn(expiresAt: string, now: number, t: Translator): string {
  const days = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000);
  return days <= 0 ? t("ended") : days === 1 ? t("ends within a day") : t("ends in {days} days", { days });
}

function mandateLine(agent: AgentWithMandate, t: Translator): string {
  const mandate = agent.mandate;
  if (mandate === null) return t("Reads only. No mandate: it cannot ask for any transaction.");
  const kinds = mandate.kinds.map((kind) => t(KIND_SHORT[kind])).join(t.locale === "zh-CN" ? "、" : ", ");
  const line = t("May {kinds} · up to {each} each, {daily} a day", {
    kinds,
    each: formatUsd(mandate.perIntentUsd, { decimals: 0 }),
    daily: formatUsd(mandate.dailyUsd, { decimals: 0 }),
  });
  return mandate.autoPerps ? `${line} · ${t("perps run without review")}` : line;
}

function AgentRow({ agent, feed, now }: { agent: AgentWithMandate; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mandate = agent.mandate;
  const used = mandate === null ? 0 : Math.min(1, agent.spentTodayUsd / mandate.dailyUsd);

  const revoke = async () => {
    if (mandate === null) return;
    setBusy(true);
    const result = await feed.write(`/api/rails/mandates/${mandate.id}`, "DELETE");
    setBusy(false);
    setError(result.error);
  };

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{agent.name}</span>
        {mandate === null ? <StatusDot tone="muted">{t("Read only")}</StatusDot> : <StatusDot tone="positive">{t("Mandate")}</StatusDot>}
      </div>
      <p className="type-label mt-0.5 text-text-secondary">{mandateLine(agent, t)}</p>
      <p className="type-label mt-0.5 text-text-muted">
        <span className="type-mono-addr">{agent.prefix}…</span>
        {agent.lastUsedAt !== null && now !== null && <>{" "}{t("· used {lastUsedAt}", { lastUsedAt: formatRelativeTime(agent.lastUsedAt, now, t.locale) })}</>}
        {mandate?.expiresAt !== null && mandate?.expiresAt !== undefined && now !== null && <> · {endsIn(mandate.expiresAt, now, t)}</>}
      </p>
      {mandate !== null && (
        <div className="mt-2 flex items-center gap-2" aria-label={t("{spentTodayUsd} of {dailyUsd} used today", { spentTodayUsd: formatUsd(agent.spentTodayUsd), dailyUsd: formatUsd(mandate.dailyUsd, { decimals: 0 }) })}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-hover">
            <div className="h-full rounded-pill bg-accent" style={{ width: `${(used * 100).toFixed(1)}%` }} />
          </div>
          <span className="type-data-sm shrink-0 tabular-nums text-text-muted">
            {t("{spentTodayUsd} / {dailyUsd} today", { spentTodayUsd: formatUsd(agent.spentTodayUsd), dailyUsd: formatUsd(mandate.dailyUsd, { decimals: 0 }) })}
          </span>
        </div>
      )}
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="xs" variant={mandate === null ? "accent" : "quiet"} onClick={() => setEditing(true)}>
            {mandate === null ? t("Grant a mandate") : t("Change mandate")}
          </Button>
          {mandate !== null && (
            <Button size="xs" variant="danger" disabled={busy} onClick={() => void revoke()}>
              {t("Revoke mandate")}
            </Button>
          )}
        </div>
      )}
      {editing && <MandateForm agent={agent} feed={feed} onDone={() => setEditing(false)} />}
      <Problem text={error} />
    </li>
  );
}

export function AgentList({ data, feed, now }: { data: RailsResponse; feed: RailsFeed; now: number | null }) {
  const t = useT();
  return (
    <DrawerCard icon={Bot} title={t("Your agents")}>
      {data.agents.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <div className="flex flex-col gap-1">
            <p className="type-body-sm text-text-primary">{t("No agents connected.")}</p>
            <p className="type-body-sm text-text-secondary">
              {t("Create a key in Connections, then set its mandate here. Granting a mandate is a separate step: until you grant one, the key can only read.")}
            </p>
          </div>
          <Link href={AGENT_KEYS_HREF} className={buttonVariants({ variant: "accent", size: "md" })}>
            <Link2 size={15} aria-hidden />
            {t("Create an agent key")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.agents.map((agent) => (
              <AgentRow key={agent.keyId} agent={agent} feed={feed} now={now} />
            ))}
          </ul>
          <Link href={AGENT_KEYS_HREF} className="type-label inline-flex items-center gap-1.5 self-start text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
            <Link2 size={13} aria-hidden />
            {t("Create another agent key")}
          </Link>
        </div>
      )}
    </DrawerCard>
  );
}
