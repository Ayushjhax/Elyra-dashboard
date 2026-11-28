"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, HandCoins } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Problem, railsField } from "@/components/rails/AgentList";
import { CopyButton, DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button, buttonVariants } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { formatRelativeTime } from "@/lib/format";
import { DEFAULT_OPEN_FOR_HOURS, OPEN_FOR_HOURS, REQUEST_LABEL_MAX, requestFormProblem, type RequestFormProblem } from "@/lib/rails/requestForm";
import { MAX_REQUEST_USDC } from "@/lib/rails/solanaPay";
import type { PaymentRequestView, RailsResponse } from "@/lib/rails/types";
import type { RailsFeed } from "@/lib/rails/useRails";
import { txExplorerUrl } from "@/lib/solana/address";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Get paid: a USDC request on Solana, payable straight to the person's own
   wallet (POST /api/rails/requests, lib/rails/requests.ts).

   The form is held to the server's own rules (lib/rails/requestForm.ts):
   "Create request" is enabled only when they pass, and whatever stops it is
   said beside it. One submission at a time — a second press while the first
   is in flight does nothing. The request that comes back is shown with its
   link and its Solana Pay code.

   Its status is the chain's. While it is open on screen, it is read from the
   public status route every ten seconds (GET /api/pay/[id] → readRequest →
   checkRequest), which settles it only from a confirmed transfer carrying
   its reference; "Paid" appears when that check says so, never before.
--------------------------------------------------------------------------- */

const CHECK_MS = 10_000;

function hoursLabel(hours: number, t: Translator): string {
  return hours === 1 ? t("1 hour") : hours === 24 ? t("24 hours") : hours === 72 ? t("3 days") : t("7 days");
}

function problemText(problem: RequestFormProblem, t: Translator): string {
  switch (problem) {
    case "wallet":
      return t("This account has no Solana wallet to be paid into.");
    case "amount":
      return t("Enter an amount of USDC above zero, such as 12.50.");
    case "too_much":
      return t("A request may ask for at most {max} USDC.", { max: MAX_REQUEST_USDC.toLocaleString("en-US") });
    case "label":
      return t("Say what it is for — the payer sees it.");
  }
}

function statusDot(status: PaymentRequestView["status"], t: Translator) {
  return status === "paid" ? (
    <StatusDot tone="positive">{t("Paid")}</StatusDot>
  ) : status === "open" ? (
    <StatusDot tone="accent">{t("Awaiting payment")}</StatusDot>
  ) : status === "expired" ? (
    <StatusDot tone="muted">{t("Expired")}</StatusDot>
  ) : (
    <StatusDot tone="muted">{t("Cancelled")}</StatusDot>
  );
}

/** The request just made: its link, its code, and its status as the chain has it. */
function NewRequest({ request, onSettled, onDone }: { request: PaymentRequestView; onSettled: () => void; onDone: () => void }) {
  const t = useT();
  const [live, setLive] = useState<Pick<PaymentRequestView, "status" | "paidSignature">>({ status: request.status, paidSignature: request.paidSignature });

  useEffect(() => {
    if (live.status !== "open") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch(`/api/pay/${request.id}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? ((await response.json()) as { request?: Pick<PaymentRequestView, "status" | "paidSignature"> }) : null))
        .then((body) => {
          if (cancelled || body?.request === undefined) return;
          const next = { status: body.request.status, paidSignature: body.request.paidSignature };
          setLive(next);
          if (next.status === "paid") onSettled();
        })
        .catch(() => {});
    }, CHECK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live.status, request.id, onSettled]);

  return (
    <section aria-label={t("Your new payment request")} className="flex flex-col gap-3 rounded-card border border-accent-quiet bg-surface-base p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-data tabular-nums text-text-primary">{t("{amount} USDC", { amount: request.amount })}</p>
          <p className="type-label truncate text-text-secondary">{request.label}</p>
        </div>
        <span aria-live="polite">{statusDot(live.status, t)}</span>
      </div>

      {live.status === "paid" ? (
        <p className="type-body-sm text-text-secondary">
          {t("Paid on Solana, confirmed from the chain and recorded in your ledger.")}{" "}
          {live.paidSignature !== null && (
            <a href={txExplorerUrl(live.paidSignature)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-text-primary underline underline-offset-2">
              {t("Payment on Solscan")}
              <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </p>
      ) : live.status === "open" ? (
        <>
          <div className="flex flex-col items-center gap-2">
            <QrCode value={request.solanaPayUrl} label={t("Solana Pay code to pay {amount} USDC", { amount: request.amount })} className="size-40" />
            <p className="type-label text-center text-text-muted">{t("Scan with any Solana Pay wallet.")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-raised py-1 pl-3 pr-1">
            <span className="type-mono-addr min-w-0 flex-1 truncate text-text-secondary">{request.payUrl}</span>
            <CopyButton value={request.payUrl} label={t("payment link")} />
            <a
              href={request.payUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("Open the pay page")}
              className="grid size-8 shrink-0 place-items-center rounded-control text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
            </a>
          </div>
          <p className="type-label text-text-muted">{t("Its status is checked against the chain every ten seconds while it is open here.")}</p>
        </>
      ) : (
        <p className="type-body-sm text-text-secondary">{live.status === "expired" ? t("This request lapsed before it was paid.") : t("This request was cancelled.")}</p>
      )}

      <div>
        <Button size="xs" variant="quiet" onClick={onDone}>
          {t("Done")}
        </Button>
      </div>
    </section>
  );
}

function RequestRow({ request, feed, now }: { request: PaymentRequestView; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate text-text-primary">{request.label}</span>
        <span className="type-data-sm shrink-0 tabular-nums text-text-primary">{t("{amount} USDC", { amount: request.amount })}</span>
      </div>
      <p className="type-label flex flex-wrap items-center gap-x-2 text-text-muted">
        {statusDot(request.status, t)}
        {request.agent !== null && <span>{t("asked by {agent}", { agent: request.agent })}</span>}
        {now !== null && <span>{formatRelativeTime(request.paidAt ?? request.createdAt, now, t.locale)}</span>}
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {request.status === "open" && (
          <a href={request.payUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "quiet", size: "xs" })}>
            <ExternalLink size={12} aria-hidden />
            {t("Pay page")}
          </a>
        )}
        {request.paidSignature !== null && (
          <a href={txExplorerUrl(request.paidSignature)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "quiet", size: "xs" })}>
            <ExternalLink size={12} aria-hidden />
            {t("Payment on Solscan")}
          </a>
        )}
        {request.status === "open" && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            aria-label={t("Cancel the request for {label}", { label: request.label })}
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

export function GetPaid({ data, feed, now }: { data: RailsResponse; feed: RailsFeed; now: number | null }) {
  const t = useT();
  const auth = useElyraAuth();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState<number>(DEFAULT_OPEN_FOR_HOURS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRequestView | null>(null);
  /* A second press while the first request is in flight is ignored, even before React re-renders. */
  const inFlight = useRef(false);
  const problem = requestFormProblem({ amount, label, hasWallet: auth.solanaAddress !== null });
  /* The wallet is said at once; the fields only once the person has started on them. */
  const shownProblem = problem === "wallet" || amount.length > 0 || label.length > 0 ? problem : null;
  const others = data.requests.filter((request) => request.id !== created?.id);

  const create = async () => {
    if (problem !== null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await feed.write("/api/rails/requests", "POST", { amount, label, expiresInMinutes: hours * 60 });
    inFlight.current = false;
    setBusy(false);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    const made = (result.body as { request?: PaymentRequestView }).request;
    if (made !== undefined) setCreated(made);
    setAmount("");
    setLabel("");
  };

  return (
    <DrawerCard icon={HandCoins} title={t("Get paid")}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <p className="type-body-sm text-text-secondary">
          {t("Request USDC on Solana with a payment link and a Solana Pay code. It is paid straight to your own wallet — Elyra never holds the money.")}
        </p>
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @[17.5rem]:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="request-amount" className="type-label text-text-secondary">
                {t("Amount (USDC)")}
              </label>
              <input
                id="request-amount"
                inputMode="decimal"
                autoComplete="off"
                className={railsField}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="25"
                aria-invalid={shownProblem === "amount" || shownProblem === "too_much"}
                aria-describedby="request-problem"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="request-hours" className="type-label text-text-secondary">
                {t("Open for")}
              </label>
              <select id="request-hours" className={railsField} value={hours} onChange={(event) => setHours(Number(event.target.value))}>
                {OPEN_FOR_HOURS.map((option) => (
                  <option key={option} value={option}>
                    {hoursLabel(option, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="request-label" className="type-label text-text-secondary">
            {t("What it is for")}
          </label>
          <input
            id="request-label"
            className={railsField}
            maxLength={REQUEST_LABEL_MAX}
            autoComplete="off"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t("Shown to the payer")}
            aria-invalid={shownProblem === "label"}
            aria-describedby="request-problem"
          />
        </div>
        {/* Disabled, the accent fill matches the card; the border keeps it a button. */}
        <Button type="submit" variant="accent" disabled={busy || problem !== null} className="w-full disabled:border disabled:border-border-strong">
          {busy ? t("Creating…") : t("Create request")}
        </Button>
        <p id="request-problem" aria-live="polite" className={cn("type-label", shownProblem === null ? "sr-only" : "text-text-secondary")}>
          {shownProblem === null ? "" : problemText(shownProblem, t)}
        </p>
        <Problem text={error} />
      </form>

      {created !== null && (
        <div className="mt-3">
          <NewRequest key={created.id} request={created} onSettled={feed.refresh} onDone={() => setCreated(null)} />
        </div>
      )}

      {others.length > 0 && (
        <section aria-label={t("Recent requests")} className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <h3 className="type-eyebrow text-text-muted">{t("Recent requests")}</h3>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {others.map((request) => (
              <RequestRow key={request.id} request={request} feed={feed} now={now} />
            ))}
          </ul>
        </section>
      )}
    </DrawerCard>
  );
}
