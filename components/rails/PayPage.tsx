"use client";

import { useEffect, useState } from "react";
import { Check, Clock, ExternalLink, Wallet } from "lucide-react";
import { QrCode } from "@/components/ui/QrCode";
import { useCopy } from "@/lib/clipboard";
import { txExplorerUrl } from "@/lib/solana/address";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The pay page. Polls the public request (/api/pay/[id]) every five seconds
   while it is open, so a payer sees it turn to paid the moment the chain
   shows it — the server reads the chain, never the payer's word.

   The label and note are the requester's text (sometimes an agent's): shown
   as text, attributed to the request, never as Elyra's own words.
--------------------------------------------------------------------------- */

interface PublicRequest {
  id: string;
  label: string;
  memo: string | null;
  recipient: string;
  amount: string;
  status: "open" | "paid" | "expired" | "cancelled";
  solanaPayUrl: string;
  paidSignature: string | null;
  paidAt: string | null;
  expiresAt: string;
}

const POLL_MS = 5_000;

function CopyAddress({ address }: { address: string }) {
  const { state, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(address)}
      className="type-label rounded-control border border-border-subtle px-2.5 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    >
      {state === "copied" ? "Copied" : "Copy address"}
    </button>
  );
}

export function PayPage({ id }: { id: string }) {
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      try {
        const response = await fetch(`/api/pay/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { request?: PublicRequest; error?: string };
        if (stopped) return;
        if (!response.ok || body.request === undefined) {
          setError(body.error ?? "This payment request could not be read.");
        } else {
          setError(null);
          setRequest(body.request);
          if (body.request.status !== "open") return;
        }
      } catch {
        if (!stopped) setError("The network did not answer. Retrying.");
      }
      if (!stopped) timer = setTimeout(() => void read(), POLL_MS);
    };
    void read();
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [id]);

  return (
    <main className="flex min-h-dvh items-start justify-center bg-surface-base px-4 py-10">
      <section aria-labelledby="pay-title" className="w-full max-w-sm rounded-sheet border border-border-subtle bg-surface-panel p-5">
        <p className="type-eyebrow text-text-muted">Payment request · via Elyra</p>
        {request === null ? (
          <p className="type-body-sm mt-4 text-text-secondary">{error ?? "Reading the request…"}</p>
        ) : (
          <>
            <h1 id="pay-title" className="type-h2 mt-2 font-sans text-text-primary">
              {request.label}
            </h1>
            <p className="type-display mt-3 text-text-primary">
              {request.amount} <span className="type-h2 text-text-secondary">USDC</span>
            </p>
            <p className="type-label mt-1 text-text-muted">on Solana</p>
            {request.memo !== null && <p className="type-body-sm mt-3 text-text-secondary">{request.memo}</p>}

            {request.status === "open" ? (
              <div className="mt-5 flex flex-col items-center gap-3">
                <QrCode value={request.solanaPayUrl} label={`Solana Pay code to pay ${request.amount} USDC`} className="size-52" />
                <a
                  href={request.solanaPayUrl}
                  className="type-body-sm inline-flex h-10 w-full items-center justify-center gap-2 rounded-control bg-accent px-4 font-medium text-text-on-accent hover:bg-accent-hover"
                >
                  <Wallet size={16} aria-hidden /> Open in a Solana wallet
                </a>
                <p className="type-label text-center text-text-muted">
                  Scan with Phantom, Solflare or any Solana Pay wallet. The page updates when the payment lands.
                </p>
              </div>
            ) : (
              <p
                role="status"
                className={cn(
                  "type-body-sm mt-5 flex items-center gap-2 rounded-card border px-3 py-2.5",
                  request.status === "paid" ? "border-positive/40 bg-positive-bg text-positive" : "border-border-subtle text-text-secondary",
                )}
              >
                {request.status === "paid" ? <Check size={15} aria-hidden /> : <Clock size={15} aria-hidden />}
                {request.status === "paid" ? "Paid — settled on-chain." : request.status === "expired" ? "This request has expired." : "This request was cancelled."}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-1.5 border-t border-border-subtle pt-4">
              <span className="type-label text-text-muted">Paid to this wallet</span>
              <span className="type-mono-addr break-all text-text-primary">{request.recipient}</span>
              <div className="flex flex-wrap gap-2 pt-1">
                <CopyAddress address={request.recipient} />
                {request.paidSignature !== null && (
                  <a
                    href={txExplorerUrl(request.paidSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="type-label inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-2.5 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  >
                    <ExternalLink size={12} aria-hidden /> The payment on Solscan
                  </a>
                )}
              </div>
            </div>
            <p className="type-label mt-4 text-text-muted">
              The money goes straight from your wallet to the one above; Elyra never holds it. Only pay requests you expect — anyone can make one.
            </p>
            {error !== null && <p className="type-label mt-2 text-text-muted">{error}</p>}
          </>
        )}
      </section>
    </main>
  );
}
