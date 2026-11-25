"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Check, Copy, Download, ExternalLink, HandCoins, History, Inbox, Link2, ShieldCheck, ShieldX } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { PaymentDialog } from "@/components/rails/PaymentDialog";
import { DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button, buttonVariants } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useCopy } from "@/lib/clipboard";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { MANDATE_KIND_LABEL, MANDATE_KINDS, type AgentWithMandate, type IntentView, type LedgerEvent, type MandateKind, type PaymentRequestView, type RailsResponse } from "@/lib/rails/types";
import { useRails, type RailsFeed } from "@/lib/rails/useRails";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import type { Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Agents: where the person decides what their AI agents may do with their
   money, and answers what the agents ask for.

   An agent holds an Elyra key (made in Connections), never a wallet key. A
   mandate here says what that key may ask for and how much; every ask is
   decided against it and lands in "Waiting for you" or, refused, in the
   activity with the reason. A swap or a payment is signed in the person's
   own wallet; a perp order runs on approval, or at once when the mandate
   lets it. Payment requests let an agent — or the person — be paid in USDC.
   The ledger is the record of all of it, hash-chained and exportable.

   An agent's stated reason is its own text: shown as text, labelled as the
   agent's, and never acted on.
--------------------------------------------------------------------------- */

const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
);

function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

const STATUS_WORD: Record<IntentView["status"], string> = {
  pending: msg("Needs your review"),
  approved: msg("Waiting for your signature"),
  executed: msg("Done"),
  rejected: msg("Refused by the mandate"),
  declined: msg("You declined"),
  expired: msg("Lapsed"),
  failed: "Failed",
};

/* ---- waiting for you ---- */

function IntentCard({ intent, feed, now, onSign }: { intent: IntentView; feed: RailsFeed; now: number | null; onSign: (intent: IntentView) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (op: "approve" | "decline") => {
    setBusy(true);
    setError(null);
    const result = await feed.write(`/api/rails/intents/${intent.id}`, "POST", { op });
    setBusy(false);
    if (result.error !== null) return setError(result.error);
    const updated = (result.body as { intent?: IntentView }).intent;
    if (op === "approve" && updated !== undefined && updated.status === "approved" && updated.kind !== "perp_order") onSign(updated);
  };
  const minutesLeft = now === null ? null : Math.max(0, Math.ceil((Date.parse(intent.expiresAt) - now) / 60_000));

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 font-medium text-text-primary">{intent.summary}</span>
        {intent.usdValue !== null && <span className="type-data-sm shrink-0 text-text-secondary">{formatUsd(intent.usdValue)}</span>}
      </div>
      <p className="type-label text-text-muted">
        {intent.agent} · {t(STATUS_WORD[intent.status])}
        {minutesLeft !== null && <>{" "}{t("· lapses in")}{" "}{minutesLeft <= 1 ? t("a minute") : t("{minutesLeft} min", { minutesLeft })}</>}
      </p>
      {intent.memo !== null && (
        <p className="type-label rounded-control border border-border-subtle bg-surface-base px-2.5 py-1.5 text-text-secondary">
          <span className="text-text-muted">{t("The agent says:")}{" "}</span>
          {intent.memo}
        </p>
      )}
      {intent.params.kind === "payment" && (
        <p className="type-label text-text-muted">
          {t("To")}{" "}<span className="type-mono-addr break-all text-text-secondary">{intent.params.to}</span>
          {intent.screening !== null && intent.screening.status === "clear" && t(" · not on the OFAC sanctions list")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {intent.status === "pending" ? (
          <>
            <Button size="sm" variant="accent" disabled={busy} onClick={() => void answer("approve")}>
              {intent.kind === "perp_order" ? (intent.params.kind === "perp_order" ? t("Approve {mode} order", { mode: t(intent.params.mode) }) : t("Approve order")) : t("Approve and sign")}
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => void answer("decline")}>
              {t("Decline")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="accent" disabled={busy} onClick={() => onSign(intent)}>
              {intent.kind === "swap" ? t("Review swap") : t("Sign payment")}
            </Button>
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => void answer("decline")}>
              {t("Decline")}
            </Button>
          </>
        )}
      </div>
      <Problem text={error} />
    </li>
  );
}

function Waiting({ data, feed, now }: { data: RailsResponse; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [signing, setSigning] = useState<IntentView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const waiting = data.intents.filter((intent) => intent.status === "pending" || intent.status === "approved");
  const address = auth.solanaAddress;

  const confirmSwap = async (intent: IntentView, signature: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await authedFetch(`/api/rails/intents/${intent.id}`, { method: "POST", body: JSON.stringify({ op: "confirm", signature }) });
      if (response.ok || response.status !== 503) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setNotice(response.ok ? t("{summary} — done, and recorded in your ledger.", { summary: intent.summary }) : (body.error ?? t("The swap landed but could not be recorded.")));
        feed.refresh();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    setNotice(t("The swap landed; it will show as done once the network catches up."));
  };

  return (
    <DrawerCard icon={Inbox} title={t("Waiting for you")} right={waiting.length > 0 ? <StatusDot tone="caution">{waiting.length}</StatusDot> : undefined}>
      {waiting.length === 0 ? (
        <p className="type-body-sm text-text-secondary">{t("Nothing is waiting. When an agent asks for something inside its mandate, it appears here and you are notified.")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {waiting.map((intent) => (
            <IntentCard key={intent.id} intent={intent} feed={feed} now={now} onSign={setSigning} />
          ))}
        </ul>
      )}
      {notice !== null && (
        <p role="status" className="type-label mt-3 text-text-secondary">
          {notice}
        </p>
      )}
      {signing !== null && address === null && <Problem text={t("This account has no Solana wallet to sign with.")} />}
      {signing !== null && address !== null && signing.params.kind === "swap" && (
        <SwapDialog
          address={address}
          initialFrom={signing.params.from}
          initialTo={signing.params.to}
          initialAmount={signing.params.amount}
          onExecuted={(signature) => void confirmSwap(signing, signature)}
          onClose={() => {
            setSigning(null);
            feed.refresh();
          }}
        />
      )}
      {signing !== null && address !== null && signing.params.kind === "payment" && (
        <PaymentDialog
          intent={signing}
          address={address}
          onClose={() => {
            setSigning(null);
            feed.refresh();
          }}
        />
      )}
    </DrawerCard>
  );
}

/* ---- agents and their mandates ---- */

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
            <input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggle(kind)} />
            {MANDATE_KIND_LABEL[kind]}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">{t("Per transaction ($)")}</span>
          <input id={`per-${id}`} inputMode="decimal" className={field} value={perIntent} onChange={(event) => setPerIntent(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">{t("Per day ($)")}</span>
          <input inputMode="decimal" className={field} value={daily} onChange={(event) => setDaily(event.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-secondary">{t("Only these assets (optional)")}</span>
        <input className={field} value={assets} onChange={(event) => setAssets(event.target.value)} placeholder={t("Any — or e.g. SOL, USDC, BTC")} />
      </label>
      {kinds.includes("payment") && (
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">{t("Only these payees (optional, one Solana address a line)")}</span>
          <textarea
            rows={3}
            className={cn(field, "h-auto py-2 font-mono")}
            value={payees}
            onChange={(event) => setPayees(event.target.value)}
            placeholder={t("Any payee that passes sanctions screening")}
          />
        </label>
      )}
      {kinds.includes("perp_order") && (
        <div className="flex flex-col gap-1.5">
          <label className="type-body-sm flex items-start gap-2 text-text-primary">
            <input type="checkbox" className="mt-1" checked={autoPerps} onChange={(event) => setAutoPerps(event.target.checked)} />
            <span>
              {t("Let perp orders inside these limits run without my review")}
              <span className="type-label block text-text-muted">{t("Through your Hyperliquid trading key, which can trade and cannot withdraw.")}</span>
            </span>
          </label>
          <label className="type-body-sm flex items-start gap-2 text-text-primary">
            <input type="checkbox" className="mt-1" checked={livePerps} onChange={(event) => setLivePerps(event.target.checked)} />
            <span>
              {t("Allow live perp orders")}
              <span className="type-label block text-text-muted">{t("Otherwise they are paper only. Live also needs your trading key approved on Automation.")}</span>
            </span>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-secondary">{t("Ends")}</span>
        <select className={field} value={days} onChange={(event) => setDays(event.target.value)}>
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
      <div className="flex items-baseline justify-between gap-2">
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
          <span className="type-data-sm shrink-0 text-text-muted">
            {t("{spentTodayUsd} / {dailyUsd} today", { spentTodayUsd: formatUsd(agent.spentTodayUsd), dailyUsd: formatUsd(mandate.dailyUsd, { decimals: 0 }) })}
          </span>
        </div>
      )}
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="xs" variant="quiet" onClick={() => setEditing(true)}>
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

function Agents({ data, feed, now }: { data: RailsResponse; feed: RailsFeed; now: number | null }) {
  const t = useT();
  return (
    <DrawerCard icon={Bot} title={t("Your agents")}>
      {data.agents.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="type-body-sm text-text-secondary">
            {t("No agents yet. Give an AI agent — Claude, ChatGPT, a bot of your own — an Elyra key in Connections, then grant it a mandate here.")}
          </p>
          <Link href="/agent" className={buttonVariants({ variant: "quiet", size: "sm" })}>
            <Link2 size={14} aria-hidden />{" "}{t("Create an agent key")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {data.agents.map((agent) => (
            <AgentRow key={agent.keyId} agent={agent} feed={feed} now={now} />
          ))}
        </ul>
      )}
    </DrawerCard>
  );
}

/* ---- payment requests ---- */

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const { state, copy } = useCopy();
  return (
    <Button size="xs" variant="quiet" onClick={() => void copy(text)} aria-label={label}>
      {state === "copied" ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {state === "copied" ? t("Copied") : t("Copy link")}
    </Button>
  );
}

function RequestRow({ request, feed, now }: { request: PaymentRequestView; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const tone = request.status === "paid" ? "positive" : request.status === "open" ? "accent" : "muted";
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate text-text-primary">{request.label}</span>
        <span className="type-data-sm shrink-0 text-text-primary">{request.amount} USDC</span>
      </div>
      <p className="type-label flex flex-wrap items-center gap-x-2 text-text-muted">
        <StatusDot tone={tone}>{request.status === "open" ? t("Open") : request.status === "paid" ? t("Paid") : request.status === "expired" ? t("Expired") : t("Cancelled")}</StatusDot>
        {request.agent !== null && <span>{t("asked by {agent}", { agent: request.agent })}</span>}
        {now !== null && <span>{formatRelativeTime(request.paidAt ?? request.createdAt, now, t.locale)}</span>}
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {request.status === "open" && <CopyButton text={request.payUrl} label={t("Copy the pay link for {label}", { label: request.label })} />}
        {request.status === "open" && (
          <a href={request.payUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "quiet", size: "xs" })}>
            <ExternalLink size={12} aria-hidden />{" "}{t("Pay page")}
          </a>
        )}
        {request.paidSignature !== null && (
          <a href={txExplorerUrl(request.paidSignature)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "quiet", size: "xs" })}>
            <ExternalLink size={12} aria-hidden />{" "}{t("Payment on Solscan")}
          </a>
        )}
        {request.status === "open" && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void feed.write(`/api/rails/requests/${request.id}`, "DELETE").finally(() => setBusy(false));
            }}
          >
            {t("Cancel")}
          </Button>
        )}
      </div>
    </li>
  );
}

function GetPaid({ data, feed, now }: { data: RailsResponse; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState("24");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await feed.write("/api/rails/requests", "POST", { amount, label, expiresInMinutes: Number(hours) * 60 });
    setBusy(false);
    if (result.error !== null) setError(result.error);
    else {
      setAmount("");
      setLabel("");
    }
  };

  return (
    <DrawerCard icon={HandCoins} title={t("Get paid")}>
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {t("A USDC request on Solana to your own wallet, with a link and a Solana Pay code anyone can pay from any wallet. Agents with the mandate can make these too. It settles when the chain shows the payment — Elyra never holds the money.")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-secondary">{t("Amount (USDC)")}</span>
            <input inputMode="decimal" className={field} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-secondary">{t("Open for")}</span>
            <select className={field} value={hours} onChange={(event) => setHours(event.target.value)}>
              <option value="1">{t("1 hour")}</option>
              <option value="24">{t("24 hours")}</option>
              <option value="72">{t("3 days")}</option>
              <option value="168">{t("7 days")}</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="type-label text-text-secondary">{t("What it is for")}</span>
            <input className={field} maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Shown to the payer")} />
          </label>
        </div>
        <div>
          <Button size="sm" variant="accent" disabled={busy || amount.trim().length === 0 || label.trim().length === 0} onClick={() => void create()}>
            {busy ? t("Creating") : t("Create request")}
          </Button>
        </div>
        <Problem text={error} />
        {data.requests.length > 0 && (
          <ul className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle pt-3">
            {data.requests.map((request) => (
              <RequestRow key={request.id} request={request} feed={feed} now={now} />
            ))}
          </ul>
        )}
      </div>
    </DrawerCard>
  );
}

/* ---- activity ---- */

function Activity({ data, now }: { data: RailsResponse; now: number | null }) {
  const t = useT();
  const decided = data.intents.filter((intent) => intent.status !== "pending" && intent.status !== "approved").slice(0, 25);
  return (
    <DrawerCard icon={History} title={t("Agent activity")}>
      {decided.length === 0 ? (
        <p className="type-body-sm text-text-secondary">{t("Nothing yet. Everything an agent asks for — done, declined or refused — is listed here, with why.")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {decided.map((intent) => (
            <li key={intent.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="type-data-sm min-w-0 truncate text-text-primary">{intent.summary}</span>
                <span className={cn("type-label shrink-0", intent.status === "executed" ? "text-positive" : intent.status === "rejected" || intent.status === "failed" ? "text-negative" : "text-text-muted")}>
                  {t(STATUS_WORD[intent.status])}
                </span>
              </div>
              <span className="type-label text-text-muted">
                {intent.agent}
                {intent.usdValue !== null && <> · {formatUsd(intent.usdValue)}</>}
                {now !== null && <> · {formatRelativeTime(intent.createdAt, now, t.locale)}</>}
                {intent.receipt !== null && (
                  <>
                    {t(" · receipt")}{" "}<span className="type-mono-addr">{intent.receipt.slice(0, 10)}</span>
                  </>
                )}
              </span>
              {intent.reasons.length > 0 && <span className="type-label text-text-secondary">{intent.reasons.join(" ")}</span>}
              {typeof intent.result?.signature === "string" && (
                <a href={txExplorerUrl(intent.result.signature)} target="_blank" rel="noopener noreferrer" className="type-label inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                  <ExternalLink size={11} aria-hidden />{" "}{t("On Solscan")}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DrawerCard>
  );
}

/* ---- the ledger ---- */

const EVENT_WORD: Record<string, string> = {
  "mandate.granted": msg("Mandate granted"),
  "mandate.revoked": msg("Mandate revoked"),
  "intent.proposed": msg("Agent asked"),
  "intent.approved": msg("You approved"),
  "intent.declined": msg("You declined"),
  "intent.executed": msg("Carried out"),
  "intent.failed": "Failed",
  "intent.expired": "Lapsed",
  "request.created": msg("Payment request made"),
  "request.settled": msg("Payment received"),
  "request.expired": msg("Request expired"),
  "request.cancelled": msg("Request cancelled"),
};

function actorName(actor: string, agents: AgentWithMandate[]): string {
  if (actor === "person") return msg("You");
  if (actor === "elyra") return "Elyra";
  const keyId = actor.replace(/^agent:/, "");
  return agents.find((agent) => agent.keyId === keyId)?.name ?? msg("An agent");
}

function Ledger({ data, now }: { data: RailsResponse; now: number | null }) {
  const t = useT();
  const authedFetch = useAuthedFetch();
  const [error, setError] = useState<string | null>(null);
  const { verification, events } = data.ledger;

  /* The export carries the session's token, so it is fetched, not linked. */
  const download = async () => {
    setError(null);
    try {
      const response = await authedFetch("/api/rails/ledger?format=csv");
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `elyra-agent-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("The ledger could not be exported just now."));
    }
  };

  return (
    <DrawerCard
      icon={verification.ok ? ShieldCheck : ShieldX}
      title={t("Ledger")}
      right={verification.ok ? <StatusDot tone="positive">{t("Chain intact")}</StatusDot> : <StatusDot tone="negative">{t("Broken at #{brokenAt}", { brokenAt: verification.brokenAt })}</StatusDot>}
    >
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {t("Every mandate, every request an agent sent and what became of it, every payment — in order, each event sealed with the SHA-256 of the one before.")}
          {verification.ok && verification.count > 0 && (
            <>
              {t(" {count} events; head", { count: verification.count })}{" "}<span className="type-mono-addr">{verification.head.slice(0, 12)}</span>.
            </>
          )}
          {!verification.ok && <> {verification.reason}</>}
        </p>
        {events.length > 0 && (
          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
            {events.slice(0, 15).map((event: LedgerEvent) => (
              <li key={event.seq} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 px-2.5 py-1.5">
                <span className="type-data-sm text-text-muted">#{event.seq}</span>
                <span className="type-data-sm min-w-0 truncate text-text-primary">
                  {t(EVENT_WORD[event.event] ?? event.event)}
                  <span className="text-text-muted"> · {t(actorName(event.actor, data.agents))}</span>
                </span>
                <span className="type-label shrink-0 text-text-muted">{now !== null ? formatRelativeTime(event.at, now, t.locale) : ""}</span>
              </li>
            ))}
          </ol>
        )}
        <div>
          <Button size="sm" variant="quiet" onClick={() => void download()}>
            <Download size={14} aria-hidden />{" "}{t("Export CSV")}
          </Button>
        </div>
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}

export function RailsView() {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useRails();
  const now = useMinute();

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) {
    return (
      <DrawerCard icon={Bot} title={t("Agents")}>
        <SkeletonRows rows={4} />
      </DrawerCard>
    );
  }
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Bot}
        title={t("Sign in to manage your agents")}
        body={t("Give AI agents scoped permission to ask for swaps, payments and trades — and approve each one yourself.")}
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            {t("Sign in")}
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) return <EmptyState icon={Bot} title={t("Agents are unavailable")} body={feed.error ?? t("It will try again shortly.")} />;

  return (
    <>
      <p className="type-body-sm px-1 text-text-secondary">
        {t("Your agents ask; you decide. Each holds an Elyra key, never a wallet key. A mandate sets what it may ask for and how much; every ask is held to it, and nothing moves without your signature — except perp orders you let run.")}
      </p>
      <Waiting data={data} feed={feed} now={now} />
      <Agents data={data} feed={feed} now={now} />
      <GetPaid data={data} feed={feed} now={now} />
      <Activity data={data} now={now} />
      <Ledger data={data} now={now} />
    </>
  );
}
