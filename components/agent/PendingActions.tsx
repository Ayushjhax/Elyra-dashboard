"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button, buttonVariants } from "@/components/ui/Button";
import type { OpenAction } from "@/app/api/actions/route";
import { swapPrefill, useOpenActions } from "@/lib/actions/useOpenActions";
import { useSecond } from "@/lib/useClock";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Actions awaiting review — kept apart from the conversation.

   These are real prepared actions: a swap or a perp move Elyra prepared in
   Telegram, where "Review in Elyra" stores it and a tap only acknowledges it.
   A chat account is not a wallet, so this is where one is finished.

   A ready swap opens the swap dialog with the prepared amounts filled in.
   The dialog re-quotes through Jupiter and the browser wallet signs; only
   after the swap lands, with its signature in hand, is the action recorded
   as confirmed. Anything else — a perp close, a transfer — says plainly what
   cannot be done here and why, because exchange connections are read-only.
   "Dismiss" sets it aside on the server, so it does not come back on reload
   or in another tab.
--------------------------------------------------------------------------- */

/** The last badge request handled, so a remount does not scroll again. */
let handledFocus = 0;

function remaining(expiresAt: string, now: number | null): string {
  if (now === null) return "";
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  return minutes <= 1 ? "expires within a minute" : `expires in ${minutes} min`;
}

function ActionCard({
  entry,
  now,
  canSign,
  onReview,
  onDismiss,
}: {
  entry: OpenAction;
  now: number | null;
  canSign: boolean;
  onReview: (() => void) | null;
  onDismiss: () => void;
}) {
  const { action } = entry;
  const acknowledged = entry.status === "acknowledged";
  const origin = entry.surface === "telegram" ? "Prepared in Telegram" : "Prepared in Elyra";

  return (
    <article
      aria-label={`Action awaiting review: ${action.summary}`}
      className="agent-rail rounded-r-card border border-l-0 border-border-subtle bg-surface-raised"
    >
      <header className="flex items-center gap-2 px-3 pt-2.5">
        <ClipboardCheck size={14} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
        <span className="type-eyebrow text-text-muted">Action awaiting review</span>
        <span
          className={cn(
            "type-label ml-auto rounded-chip px-1.5",
            acknowledged ? "bg-surface-hover text-text-secondary" : "bg-negative-bg text-negative",
          )}
        >
          {acknowledged ? "Acknowledged" : "Needs review"}
        </span>
      </header>

      <div className="px-3 pt-2">
        <p className="type-body-sm font-medium text-text-primary">{action.summary}</p>
        <p className="type-label mt-0.5 text-text-secondary">
          {origin}
          {acknowledged ? " · you asked to proceed there" : ""}
          {now !== null ? ` · ${remaining(entry.expiresAt, now)}` : ""}
        </p>
      </div>

      {action.fields.length > 0 && (
        <dl className="mx-3 mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {action.fields.map((field) => (
            <div key={field.label} className="flex items-baseline justify-between gap-3 py-1">
              <dt className="type-label text-text-muted">{field.label}</dt>
              <dd className="type-data text-right text-text-primary">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {action.warnings.length > 0 && (
        <ul className="type-label mx-3 mt-2 flex flex-col gap-1 text-negative">
          {action.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <p role="status" className="type-label px-3 pt-2 text-text-secondary">
        {onReview !== null
          ? canSign
            ? "Nothing is sent until your wallet signs it. The swap is re-quoted first."
            : "Connect a Solana wallet in this browser to sign it."
          : (action.reason ?? "This kind of action cannot be carried out in Elyra.")}
      </p>

      <footer className="flex items-center justify-end gap-2 px-3 pb-3 pt-2.5">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
        {onReview !== null ? (
          <Button size="sm" variant="accent" onClick={onReview} disabled={!canSign}>
            Review swap
          </Button>
        ) : action.kind === "transfer" || action.kind === "withdraw" ? (
          <Link href="/assets" className={buttonVariants({ variant: "quiet", size: "sm" })}>
            Open Assets
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

export function PendingActions() {
  const feed = useOpenActions();
  const auth = useElyraAuth();
  const now = useSecond();
  const focusNonce = useElyraStore((state) => state.pendingFocusNonce);
  const [review, setReview] = useState<{ id: string; from: string; to: string; amount: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const canSign = auth.available && auth.solanaAddress !== null;
  /* The clock lapses a card between polls rather than leaving a dead one up. */
  const actions =
    now === null ? feed.actions : feed.actions.filter((entry) => Date.parse(entry.expiresAt) > now);

  /* The overview's badge asked for this card. */
  useEffect(() => {
    if (focusNonce <= handledFocus) return;
    const node = ref.current;
    if (!node) return;
    handledFocus = focusNonce;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    node.focus({ preventScroll: true });
  }, [focusNonce, actions.length]);

  return (
    <>
      {actions.length > 0 && (
        <div ref={ref} tabIndex={-1} className="flex flex-col gap-2 outline-none">
          {feed.error !== null && (
            <p role="alert" className="type-label text-negative">
              {feed.error}
            </p>
          )}
          {actions.map((entry) => {
            const prefill = swapPrefill(entry.action);
            return (
              <ActionCard
                key={entry.id}
                entry={entry}
                now={now}
                canSign={canSign}
                onDismiss={() => void feed.dismiss(entry.id)}
                onReview={prefill === null ? null : () => setReview({ id: entry.id, ...prefill })}
              />
            );
          })}
        </div>
      )}

      {/* Held here rather than in the card, so recording the confirmation —
          which takes the card away — does not close the dialog on its
          success screen. */}
      {review !== null && canSign && (
        <SwapDialog
          address={auth.solanaAddress}
          initialFrom={review.from}
          initialTo={review.to}
          initialAmount={review.amount}
          onExecuted={(signature) => void feed.confirm(review.id, signature)}
          onClose={() => setReview(null)}
        />
      )}
    </>
  );
}
