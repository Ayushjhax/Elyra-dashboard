"use client";

import { useState } from "react";
import { AlertTriangle, Bot, Check, Clock, Download, ExternalLink, History, Inbox, ShieldCheck, ShieldX, X, type LucideIcon } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { AgentList, Problem } from "@/components/rails/AgentList";
import { GetPaid } from "@/components/rails/GetPaid";
import { PaymentDialog } from "@/components/rails/PaymentDialog";
import { DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import type { AgentWithMandate, IntentKind, IntentView, LedgerEvent, RailsResponse } from "@/lib/rails/types";
import { useRails, type RailsFeed } from "@/lib/rails/useRails";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Agents: where the person decides what their AI agents may do with their
   money, and answers what the agents ask for. One drawer, top to bottom:

     the permission model, in a sentence or two;
     Waiting for you — what agents asked for, with the review controls;
     Your agents — each key and its mandate (components/rails/AgentList);
     Get paid — a USDC request to the person's wallet (GetPaid);
     Agent activity — every ask, its outcome and the recorded reason;
     Ledger — the hash chain of all of it, verified, and its CSV.

   An agent holds an Elyra key (made in Connections), never a wallet key. A
   mandate here says what that key may ask for and how much; every ask is
   decided against it and lands in "Waiting for you" or, refused, in the
   activity with the reason. A swap or a payment is signed in the person's
   own wallet; a perp order runs on approval, or at once when the mandate
   lets it.

   An agent's stated reason is its own text: shown as text, labelled as the
   agent's, and never acted on.
--------------------------------------------------------------------------- */

const STATUS_WORD: Record<IntentView["status"], string> = {
  pending: msg("Needs your review"),
  approved: msg("Waiting for your signature"),
  executed: msg("Done"),
  rejected: msg("Refused by the mandate"),
  declined: msg("You declined"),
  expired: msg("Lapsed"),
  failed: msg("Failed"),
};

/** How each outcome looks: an icon and a tone as well as its word, so none is told by colour alone. */
const OUTCOME: Record<IntentView["status"], { icon: LucideIcon; tone: string }> = {
  pending: { icon: Clock, tone: "text-caution" },
  approved: { icon: Clock, tone: "text-caution" },
  executed: { icon: Check, tone: "text-positive" },
  rejected: { icon: ShieldX, tone: "text-negative" },
  declined: { icon: X, tone: "text-text-secondary" },
  expired: { icon: Clock, tone: "text-text-muted" },
  failed: { icon: AlertTriangle, tone: "text-negative" },
};

const KIND_WORD: Record<IntentKind, string> = {
  swap: msg("Swap"),
  payment: msg("Payment"),
  perp_order: msg("Perp order"),
};

function Outcome({ status }: { status: IntentView["status"] }) {
  const t = useT();
  const { icon: Icon, tone } = OUTCOME[status];
  return (
    <span className={cn("type-label inline-flex shrink-0 items-center gap-1", tone)}>
      <Icon size={12} strokeWidth={2} aria-hidden />
      {t(STATUS_WORD[status])}
    </span>
  );
}

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
      <div className="flex items-center gap-2">
        <span className="type-label min-w-0 truncate text-text-secondary">{intent.agent}</span>
        <span className="type-label inline-flex h-6 shrink-0 items-center rounded-chip border border-border-subtle px-2 text-text-secondary">{t(KIND_WORD[intent.kind])}</span>
        {intent.usdValue !== null && <span className="type-data-sm ml-auto shrink-0 tabular-nums text-text-primary">{formatUsd(intent.usdValue)}</span>}
      </div>
      <p className="type-body-sm font-medium text-text-primary">{intent.summary}</p>
      <p className="type-label text-text-muted">
        {t(STATUS_WORD[intent.status])}
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
        <div className="flex flex-col gap-0.5">
          <p className="type-body-sm text-text-primary">{t("No pending requests.")}</p>
          <p className="type-label text-text-muted">{t("When an agent asks for something inside its mandate, it appears here and you are notified.")}</p>
        </div>
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

/* ---- activity ---- */

function Activity({ data, now }: { data: RailsResponse; now: number | null }) {
  const t = useT();
  const decided = data.intents.filter((intent) => intent.status !== "pending" && intent.status !== "approved").slice(0, 25);
  return (
    <DrawerCard icon={History} title={t("Agent activity")}>
      {decided.length === 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="type-body-sm text-text-primary">{t("No activity yet.")}</p>
          <p className="type-label text-text-muted">{t("Everything an agent asks for — done, declined or refused — is listed here with its outcome and the reason.")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {decided.map((intent) => (
            <li key={intent.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <span className="type-data-sm min-w-0 text-text-primary">{intent.summary}</span>
                <Outcome status={intent.status} />
              </div>
              <span className="type-label tabular-nums text-text-muted">
                {intent.agent} · {t(KIND_WORD[intent.kind])}
                {intent.usdValue !== null && <> · {formatUsd(intent.usdValue)}</>}
                {now !== null && <> · {formatRelativeTime(intent.createdAt, now, t.locale)}</>}
              </span>
              {intent.reasons.length > 0 && (
                <span className="type-label text-text-secondary">
                  <span className="text-text-muted">{t("Reason:")}</span> {intent.reasons.join(" ")}
                </span>
              )}
              {(intent.receipt !== null || typeof intent.result?.signature === "string") && (
                <span className="type-label flex flex-wrap items-center gap-x-2 text-text-muted">
                  {intent.receipt !== null && (
                    <span>
                      {t("Receipt")} <span className="type-mono-addr">{intent.receipt.slice(0, 10)}</span>
                    </span>
                  )}
                  {typeof intent.result?.signature === "string" && (
                    <a href={txExplorerUrl(intent.result.signature)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                      <ExternalLink size={11} aria-hidden />
                      {t("On Solscan")}
                    </a>
                  )}
                </span>
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
  "intent.failed": msg("Failed"),
  "intent.expired": msg("Lapsed"),
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { verification, events } = data.ledger;

  /* The export carries the session's token, so it is fetched, not linked. */
  const download = async () => {
    setBusy(true);
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
    } finally {
      setBusy(false);
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
          {t("A chained history of every mandate, request, outcome and payment, each event sealed with the SHA-256 of the one before.")}
          {verification.ok && verification.count > 0 && (
            <>
              {" "}
              {verification.count === 1 ? t("1 event, verified;") : t("{count} events, verified;", { count: verification.count })}{" "}
              {t("head")} <span className="type-mono-addr">{verification.head.slice(0, 12)}</span>.
            </>
          )}
          {!verification.ok && <> {verification.reason}</>}
        </p>
        {events.length > 0 && (
          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-base">
            {events.slice(0, 15).map((event: LedgerEvent) => (
              <li key={event.seq} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 px-2.5 py-1.5">
                <span className="type-data-sm tabular-nums text-text-muted">#{event.seq}</span>
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
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => void download()}>
            <Download size={14} aria-hidden />
            {busy ? t("Exporting…") : t("Export CSV")}
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
        {t("Each agent uses an Elyra key, never a wallet key. Its mandate limits which actions it can request and for how much. Swaps and payments are signed in your own wallet; perp orders need your approval, unless you let them run inside the mandate.")}
      </p>
      <Waiting data={data} feed={feed} now={now} />
      <AgentList data={data} feed={feed} now={now} />
      <GetPaid data={data} feed={feed} now={now} />
      <Activity data={data} now={now} />
      <Ledger data={data} now={now} />
    </>
  );
}
