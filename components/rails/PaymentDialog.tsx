"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { IntentView } from "@/lib/rails/types";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { CANCELLED, signingFailure } from "@/lib/wallet/flows";
import { decodeBase64, encodeBase64 } from "@/lib/wallet/runSwap";

/* ---------------------------------------------------------------------------
   Signing an agent's approved payment.

   The transfer is built by the server from the intent as it was recorded
   (/api/rails/intents/[id]/build) — payee, amount and Solana Pay reference
   are the intent's, and nothing typed here can change them. The wallet
   signs it here; /api/transfer/submit broadcasts it and watches it land,
   exactly as for a transfer the person starts themselves; and only then is
   the intent confirmed, by a signature the server checks against the chain.
--------------------------------------------------------------------------- */

interface Built {
  unsignedTransaction: string;
  lastValidBlockHeight: number;
  to: string;
  amount: string;
  signer: string;
}

type Phase = "building" | "review" | "signing" | "watching" | "done" | "failed";

export function PaymentDialog({ intent, address, onClose }: { intent: IntentView; address: string; onClose: () => void }) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const authedFetch = useAuthedFetch();
  const [phase, setPhase] = useState<Phase>("building");
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    void (async () => {
      try {
        const response = await authedFetch(`/api/rails/intents/${intent.id}/build`, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as Partial<Built> & { error?: string };
        if (cancelled.current) return;
        if (!response.ok || typeof body.unsignedTransaction !== "string") {
          setError(body.error ?? "The payment could not be prepared.");
          setPhase("failed");
          return;
        }
        if (body.signer !== address) {
          setError("This payment was built for a different wallet than the one signed in here.");
          setPhase("failed");
          return;
        }
        setBuilt(body as Built);
        setPhase("review");
      } catch {
        if (!cancelled.current) {
          setError("The server could not be reached.");
          setPhase("failed");
        }
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [authedFetch, intent.id, address]);

  /** Records the payment against the intent, once the chain has it. */
  const confirm = useCallback(
    async (landed: string) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await authedFetch(`/api/rails/intents/${intent.id}`, { method: "POST", body: JSON.stringify({ op: "confirm", signature: landed }) });
        if (response.ok) {
          setPhase("done");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        /* 503: the node has not caught up yet. Anything else is an answer. */
        if (response.status !== 503) {
          setError(body.error ?? "The payment landed but could not be recorded against the request.");
          setPhase("failed");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      setError("The payment landed. Elyra could not record it yet; it will show as paid once the network catches up.");
      setPhase("failed");
    },
    [authedFetch, intent.id],
  );

  const sign = useCallback(() => {
    if (built === null) return;
    setError(null);
    setPhase("signing");
    void (async () => {
      try {
        const wallet = wallets.find((entry) => entry.address === address);
        if (wallet === undefined) throw new Error("This account's Solana wallet is not connected in this browser.");
        const { signedTransaction } = await signTransaction({ transaction: decodeBase64(built.unsignedTransaction), wallet });
        const encoded = encodeBase64(signedTransaction);
        const response = await authedFetch("/api/transfer/submit", { method: "POST", body: JSON.stringify({ signedTransaction: encoded }) });
        const body = (await response.json().catch(() => ({}))) as { status?: "confirmed" | "failed" | "pending"; signature?: string; error?: string };
        if (typeof body.signature !== "string" || body.status === "failed") {
          setError(body.error ?? "The payment was not accepted by the network.");
          setPhase("failed");
          return;
        }
        setSignature(body.signature);
        if (body.status === "confirmed") {
          await confirm(body.signature);
          return;
        }
        /* Broadcast, not yet landed: watch it, re-broadcasting as the transfer dialog does. */
        setPhase("watching");
        const started = Date.now();
        while (Date.now() - started < 90_000) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          const check = await authedFetch("/api/transfer/status", {
            method: "POST",
            body: JSON.stringify({ signature: body.signature, signedTransaction: encoded, lastValidBlockHeight: built.lastValidBlockHeight }),
          });
          const status = (await check.json().catch(() => ({}))) as { status?: string; error?: string };
          if (status.status === "confirmed") {
            await confirm(body.signature);
            return;
          }
          if (status.status === "failed") {
            setError(status.error ?? "The payment did not land.");
            setPhase("failed");
            return;
          }
        }
        setError("The payment has not landed yet. Check the explorer before trying again.");
        setPhase("failed");
      } catch (caught: unknown) {
        const message = signingFailure(caught, "The payment could not be signed.");
        setError(message === CANCELLED ? null : message);
        setPhase(message === CANCELLED ? "review" : "failed");
      }
    })();
  }, [built, wallets, address, signTransaction, authedFetch, confirm]);

  const busy = phase === "building" || phase === "signing" || phase === "watching";
  const screening = intent.screening;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Pay for {intent.agent}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">Sign a USDC payment an agent asked for, from your own wallet.</DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {phase === "done" ? (
            <div className="flex flex-col gap-2">
              <p className="type-body-sm flex items-center gap-2 text-positive">
                <Check size={15} aria-hidden /> Paid. Proven on-chain and recorded in your agent ledger.
              </p>
              {signature !== null && (
                <a href={txExplorerUrl(signature)} target="_blank" rel="noopener noreferrer" className="type-label inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary">
                  <ExternalLink size={12} aria-hidden /> View on Solscan
                </a>
              )}
            </div>
          ) : built === null ? (
            phase === "failed" ? null : (
              <p className="type-body-sm flex items-center gap-2 text-text-secondary">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Preparing the payment
              </p>
            )
          ) : (
            <>
              <dl className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-raised p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="type-label text-text-muted">You pay</dt>
                  <dd className="type-data text-text-primary">{built.amount} USDC</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="type-label text-text-muted">To</dt>
                  <dd className="type-mono-addr break-all text-text-primary">{built.to}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="type-label text-text-muted">Network</dt>
                  <dd className="type-data-sm text-text-primary">Solana</dd>
                </div>
              </dl>
              {screening !== null && (
                <p className="type-label flex items-start gap-1.5 text-text-secondary">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0 text-positive" aria-hidden />
                  Not on the OFAC sanctions list as of {new Date(screening.checkedAt).toUTCString().slice(5, 22)} UTC. That is all the screen says — check you
                  know who you are paying.
                </p>
              )}
              <p className="type-label text-text-muted">A payment cannot be reversed. It goes from your wallet straight to the payee; Elyra never holds it.</p>
            </>
          )}
          {phase === "watching" && (
            <p className="type-label flex items-center gap-2 text-text-secondary">
              <Loader2 size={13} className="animate-spin" aria-hidden /> Sent. Waiting for it to land.
            </p>
          )}
          {error !== null && (
            <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={onClose} disabled={busy}>
            {phase === "done" ? "Done" : "Close"}
          </Button>
          {(phase === "review" || phase === "signing") && (
            <Button size="sm" variant="accent" onClick={sign} disabled={busy}>
              {phase === "signing" && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {phase === "signing" ? "Signing" : `Sign and pay ${built?.amount ?? ""} USDC`}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
