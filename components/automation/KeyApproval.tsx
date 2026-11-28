"use client";

import { useId, useState } from "react";
import { useSignTypedData } from "@privy-io/react-auth";
import { Check, ChevronDown, KeyRound, ShieldCheck, Wallet, X } from "lucide-react";
import { Problem, Subhead } from "@/components/automation/parts";
import { CopyButton, DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeTime, truncateMiddle } from "@/lib/format";
import type { AutomationResponse } from "@/lib/autotrade/types";
import type { AutomationFeed } from "@/lib/autotrade/useAutomation";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Elyra's trading key: an API wallet on Hyperliquid that the person approves
   from their own wallet (app/api/automation/agent).

   Approving is two steps the person can see. Review first: "prepare" makes
   the key and returns the approval exactly as the wallet will be asked to
   sign it — the account, the network, the agent's name and address — and the
   drawer shows that, the permissions it carries, and the payload itself to
   inspect and copy. Only "Continue to wallet" hands it to the wallet (Privy's
   signing prompt, worded to match). The server checks the signature against
   the key it made and submits it to Hyperliquid; nothing is approved until
   Hyperliquid accepts it, so a cancelled or rejected signature leaves the
   key as it was: not approved.

   The permissions are the integration's, not a rule's: an API wallet can
   place and cancel orders and cannot withdraw or transfer. A rule's market,
   size and exits are set in the rule editor and are no part of this.
--------------------------------------------------------------------------- */

type TypedData = Parameters<ReturnType<typeof useSignTypedData>["signTypedData"]>[0];

interface Prepared {
  network: string;
  accountAddress: string;
  agentAddress: string;
  typedData: TypedData;
}

type Review = { status: "loading" } | { status: "ready"; prepared: Prepared } | { status: "failed"; error: string };

const cancelled = (message: string) => /reject|denied|cancel|closed|user exited/i.test(message);

function Permission({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border",
          allowed ? "border-sage/60 text-positive" : "border-negative/40 text-negative",
        )}
      >
        {allowed ? <Check size={12} strokeWidth={2} aria-hidden /> : <X size={12} strokeWidth={2} aria-hidden />}
        <span className="sr-only">{allowed ? t("Allowed") : t("Not allowed")}</span>
      </span>
      <span className="type-body-sm text-text-primary">{children}</span>
    </li>
  );
}

function Fact({ label, children, copy }: { label: string; children: React.ReactNode; copy?: { value: string; label: string } }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 py-2">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text-primary">{children}</dd>
      {copy !== undefined ? <CopyButton value={copy.value} label={copy.label} /> : <span aria-hidden className="size-8" />}
    </div>
  );
}

function ApprovalDialog({
  review,
  data,
  feed,
  onClose,
}: {
  review: Review;
  data: AutomationResponse;
  feed: AutomationFeed;
  onClose: () => void;
}) {
  const t = useT();
  const { signTypedData } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState(false);
  const payloadId = useId();
  const prepared = review.status === "ready" ? review.prepared : null;
  const payload = prepared === null ? "" : JSON.stringify(prepared.typedData, null, 2);
  const network = prepared?.network ?? data.live.network;

  const toWallet = async () => {
    if (prepared === null) return;
    setBusy(true);
    setError(null);
    try {
      const { signature } = await signTypedData(prepared.typedData, {
        address: prepared.accountAddress,
        uiOptions: {
          title: t("Approve Elyra's trading key"),
          description: t("It can place and cancel orders on your Hyperliquid account. It cannot withdraw or transfer funds."),
          buttonText: t("Approve key"),
          iconUrl: `${window.location.origin}/elyra-public-avatar.png`,
          isCancellable: true,
        },
      });
      const approved = await feed.write("/api/automation/agent", "POST", { step: "approve", signature });
      if (approved.error !== null) throw new Error(approved.error);
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("The approval did not complete.");
      setError(cancelled(message) ? t("Cancelled — nothing was approved.") : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent side="center" surface="panel" className="flex max-h-[min(860px,92dvh)] w-[min(480px,calc(100vw-24px))] flex-col gap-0 p-0">
        {/* pr-12 keeps the title clear of the dialog's own close button. */}
        <header className="drawer-head-graphite flex shrink-0 items-start gap-3 border-b border-border-subtle py-3.5 pl-4 pr-12">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-card border border-accent-quiet text-accent">
            <KeyRound size={18} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="type-h2 text-text-primary">{t("Trading key approval")}</DialogTitle>
            <DialogDescription className="type-label text-text-secondary">
              {t("Review what this key can do, then continue to your wallet to sign.")}
            </DialogDescription>
          </div>
        </header>

        <div className="@container flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {review.status === "loading" ? (
            <div aria-busy="true" aria-label={t("Preparing the key")} className="flex flex-col gap-2">
              <span className="skeleton h-4 w-3/4" />
              <span className="skeleton h-4 w-2/3" />
              <span className="skeleton h-4 w-1/2" />
            </div>
          ) : review.status === "failed" ? (
            <Problem text={review.error} />
          ) : (
            <>
              <dl className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-raised px-3">
                <Fact label={t("Account")} copy={{ value: review.prepared.accountAddress, label: t("account address") }}>
                  <span className="type-mono-addr block truncate">{truncateMiddle(review.prepared.accountAddress, 6, 4)}</span>
                  <span className="type-label block text-text-muted">{t("Your Hyperliquid account")}</span>
                </Fact>
                <Fact label={t("Network")}>
                  <span className="type-body-sm">{network === "mainnet" ? t("Hyperliquid Mainnet") : t("Hyperliquid Testnet")}</span>
                </Fact>
                <Fact label={t("Agent")} copy={{ value: review.prepared.agentAddress, label: t("agent address") }}>
                  <span className="type-body-sm block">{t("Elyra · API wallet")}</span>
                  <span className="type-mono-addr block truncate text-text-secondary">{truncateMiddle(review.prepared.agentAddress, 6, 4)}</span>
                </Fact>
              </dl>

              <section aria-labelledby={`${payloadId}-perm`} className="flex flex-col gap-2.5">
                <Subhead id={`${payloadId}-perm`} title={t("Permissions")}>
                  {t("What Hyperliquid lets an API wallet do on your account.")}
                </Subhead>
                <ul className="flex flex-col gap-2">
                  <Permission allowed>{t("Place orders on your Hyperliquid perps")}</Permission>
                  <Permission allowed>{t("Cancel orders on your account")}</Permission>
                  <Permission allowed={false}>{t("Withdraw funds")}</Permission>
                  <Permission allowed={false}>{t("Transfer funds to another address or account")}</Permission>
                </ul>
                <p className="type-label text-text-muted">
                  {t("You can remove it on Hyperliquid at any time. A rule's market, size, leverage and exits are set in the rule editor; they are not part of this key.")}
                </p>
              </section>

              <section aria-labelledby={`${payloadId}-head`} className="flex flex-col gap-2">
                <Subhead id={`${payloadId}-head`} title={t("Payload")}>
                  {t("The exact request your wallet is asked to sign.")}
                </Subhead>
                <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-base">
                  <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1.5">
                    <button
                      type="button"
                      aria-expanded={inspect}
                      aria-controls={payloadId}
                      onClick={() => setInspect(!inspect)}
                      className="type-label flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-control px-1.5 text-left text-text-primary hover:bg-surface-hover"
                    >
                      <ChevronDown size={14} aria-hidden className={cn("shrink-0 text-text-muted transition-transform motion-reduce:transition-none", !inspect && "-rotate-90")} />
                      {t("Inspect payload")}
                    </button>
                    <CopyButton value={payload} label={t("payload")} />
                  </div>
                  <pre
                    id={payloadId}
                    hidden={!inspect}
                    tabIndex={0}
                    aria-label={t("Payload")}
                    className="type-mono-addr max-h-72 overflow-auto whitespace-pre p-3 text-[12px] leading-5 text-text-secondary"
                  >
                    {payload}
                  </pre>
                </div>
              </section>
            </>
          )}

          <Problem text={error} />
          <p className="type-label text-text-muted">{t("Hyperliquid accepts this only from an account that has deposited.")}</p>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border-subtle p-4">
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button variant="accent" onClick={() => void toWallet()} disabled={busy || prepared === null}>
            <Wallet size={15} aria-hidden />
            {busy ? t("Waiting for your wallet") : t("Continue to wallet")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function KeyCard({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const now = useMinute();
  const [review, setReview] = useState<Review | null>(null);
  const agent = data.agent;
  const approvedHere = agent !== null && agent.approved && agent.network === data.live.network;

  /* "prepare" makes a fresh, unapproved key and returns what the wallet will
     sign; opening the review is that request, nothing more. */
  const startReview = async () => {
    setReview({ status: "loading" });
    const prepared = await feed.write("/api/automation/agent", "POST", { step: "prepare" });
    setReview(
      prepared.error !== null
        ? { status: "failed", error: prepared.error }
        : { status: "ready", prepared: prepared.body as unknown as Prepared },
    );
  };

  return (
    <DrawerCard
      icon={KeyRound}
      title={t("Trading key")}
      right={approvedHere ? <StatusDot tone="positive">{t("Approved")}</StatusDot> : <StatusDot tone="muted">{t("Not approved")}</StatusDot>}
    >
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {t("Live rules and live orders go through an API wallet you approve from your own wallet. It can place and cancel orders on your Hyperliquid account and cannot withdraw or transfer anything.")}
        </p>
        {data.accountAddress === null ? (
          <p className="type-label text-text-muted">{t("This account has no EVM wallet to hold a Hyperliquid account.")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="type-label text-text-muted">{t("Account")}</dt>
              <dd className="type-mono-addr truncate text-text-primary">{truncateMiddle(data.accountAddress, 6, 4)}</dd>
              <dt className="type-label text-text-muted">{t("Network")}</dt>
              <dd className="type-label text-text-primary">{data.live.network === "mainnet" ? t("Hyperliquid Mainnet") : t("Hyperliquid Testnet")}</dd>
              {agent !== null && (
                <>
                  <dt className="type-label text-text-muted">{t("Agent")}</dt>
                  <dd className="type-mono-addr truncate text-text-primary">{truncateMiddle(agent.agentAddress, 6, 4)}</dd>
                </>
              )}
            </dl>
            {approvedHere ? (
              <p className="type-label flex items-center gap-1.5 text-text-secondary">
                <ShieldCheck size={13} aria-hidden className="text-positive" />
                {agent.approvedAt !== null && now !== null
                  ? t("Approved {age}. Remove it on Hyperliquid at any time.", { age: formatRelativeTime(agent.approvedAt, now, t.locale) })
                  : t("Approved. Remove it on Hyperliquid at any time.")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div>
                  <Button size="sm" variant="accent" disabled={review?.status === "loading"} onClick={() => void startReview()} aria-haspopup="dialog">
                    <KeyRound size={14} aria-hidden />
                    {t("Review and approve")}
                  </Button>
                </div>
                {!data.live.enabled && (
                  <p className="type-label text-text-muted">{t("Live orders also need this server to send them; until then, rules and orders run on paper.")}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {review !== null && <ApprovalDialog review={review} data={data} feed={feed} onClose={() => setReview(null)} />}
    </DrawerCard>
  );
}
