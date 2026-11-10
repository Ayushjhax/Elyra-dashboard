"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { AlertTriangle, ArrowDown, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { buildSwap, runSwap, type BuiltSwap } from "@/lib/wallet/runSwap";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The swap, end to end.

   Quote, sign, submit — lib/wallet/runSwap.ts, the one path that moves funds,
   shared with each leg of an Intelligent Portfolio.

   A quote goes stale in about twenty seconds, so the confirm step re-quotes
   rather than signing bytes that have been sitting in a dialog. The freshly
   quoted numbers are shown before anything is signed — a swap that executes
   at a price the operator never saw is the failure this avoids, and it is
   worth an extra round trip.
--------------------------------------------------------------------------- */

interface TokenGroup {
  label: string;
  symbols: string[];
}

type BuildResponse = BuiltSwap;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className="type-data-sm min-w-0 truncate text-right text-text-primary">
        {value}
      </span>
    </div>
  );
}

export function SwapDialog({
  address,
  onClose,
  initialFrom = "SOL",
  initialTo = "USDC",
  initialAmount = "",
  onExecuted,
}: {
  address: string | null;
  onClose: () => void;
  /** Prefill, for a swap reviewed from a prepared action or a position row.
      Every value stays editable, and nothing is sent without a signature. */
  initialFrom?: string;
  initialTo?: string;
  initialAmount?: string;
  /** Called once the swap has landed and returned its signature. */
  onExecuted?: (signature: string) => void;
}) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  /* Both steps are scoped to the session's wallet, so both carry the token —
     Privy's cookie is not something this app can count on being set. */
  const authedFetch = useAuthedFetch();

  const [groups, setGroups] = useState<TokenGroup[]>([]);
  const [fromSymbol, setFromSymbol] = useState(initialFrom);
  const [toSymbol, setToSymbol] = useState(initialTo);
  const [amount, setAmount] = useState(initialAmount);

  const [quote, setQuote] = useState<BuildResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/swap/tokens")
      .then((response) => response.json() as Promise<{ groups?: TokenGroup[] }>)
      .then((payload) => {
        if (!cancelled) setGroups(payload.groups ?? []);
      })
      .catch(() => {
        /* The dialog still works with a typed symbol; only the picker is lost. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onQuote = useCallback(() => {
    setError(null);
    setSignature(null);
    setQuoting(true);
    void buildSwap(authedFetch, { fromSymbol, toSymbol, amount })
      .then((payload) => {
        if (payload.error !== undefined) setError(payload.error);
        else setQuote(payload);
      })
      .finally(() => setQuoting(false));
  }, [authedFetch, fromSymbol, toSymbol, amount]);

  const onConfirm = useCallback(() => {
    setError(null);

    const wallet = wallets.find((entry) => entry.address === address) ?? wallets[0];
    if (wallet === undefined) {
      setError("No Solana wallet is connected in this browser.");
      return;
    }

    setWorking(true);
    /* Re-quoted, not reused. The bytes in `quote` were built for a price that
       has moved on by now, and Jupiter will reject them as stale — better to
       sign something current than to fail at the last step. */
    void runSwap(
      authedFetch,
      async (transaction) => (await signTransaction({ transaction, wallet })).signedTransaction,
      { fromSymbol, toSymbol, amount },
      setQuote,
    )
      .then((result) => {
        if (result.ok) {
          setSignature(result.signature);
          onExecuted?.(result.signature);
        } else {
          setError(result.error);
        }
      })
      .finally(() => setWorking(false));
  }, [authedFetch, fromSymbol, toSymbol, amount, wallets, address, signTransaction, onExecuted]);

  const symbols = groups.flatMap((group) => group.symbols);
  const canQuote =
    amount.trim().length > 0 && fromSymbol !== toSymbol && address !== null && !working;
  const ready = quote?.action?.readiness === "ready";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Swap</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Swap one token for another, routed by Jupiter and signed in your browser.
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {signature === null ? (
            <>
              <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setQuote(null);
                    }}
                    placeholder="0.00"
                    aria-label="Amount to swap"
                    className="type-data min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
                  />
                  <select
                    value={fromSymbol}
                    onChange={(event) => {
                      setFromSymbol(event.target.value);
                      setQuote(null);
                    }}
                    aria-label="Token to sell"
                    className="type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary"
                  >
                    {symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-center">
                  <ArrowDown size={14} className="text-text-muted" aria-hidden />
                </div>

                <div className="flex items-center justify-end">
                  <select
                    value={toSymbol}
                    onChange={(event) => {
                      setToSymbol(event.target.value);
                      setQuote(null);
                    }}
                    aria-label="Token to receive"
                    className="type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary"
                  >
                    {symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {quote?.action !== undefined && (
                <div className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-raised px-3 py-1">
                  {quote.action.fields.map((row) => (
                    <Row key={row.label} label={row.label} value={row.value} />
                  ))}
                </div>
              )}

              {(quote?.action?.warnings ?? []).map((warning) => (
                <div
                  key={warning}
                  className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-raised px-3 py-2.5"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
                  <p className="type-label text-text-secondary">{warning}</p>
                </div>
              ))}

              {quote?.action !== undefined && !ready && (
                <div className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                  <p className="type-label text-negative">Cannot be executed</p>
                  <p className="type-label mt-1 text-text-secondary">
                    {quote.action.reason}
                  </p>
                </div>
              )}

              {address === null && (
                <p className="type-label text-text-muted">
                  Connect a Solana wallet to swap.
                </p>
              )}

              {error !== null && (
                <div role="alert" className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                  <p className="type-label text-negative">{error}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-card border border-positive/40 bg-positive-bg px-3 py-2.5">
                <Check size={14} className="text-positive" aria-hidden />
                <p className="type-label text-positive">Swap landed.</p>
              </div>
              <a
                href={txExplorerUrl(signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="type-label flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
              >
                <ExternalLink size={12} aria-hidden />
                View on explorer
              </a>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={onClose}>
            {signature === null ? "Cancel" : "Done"}
          </Button>

          {signature === null &&
            (ready ? (
              <Button size="sm" variant="accent" disabled={working} onClick={onConfirm}>
                {working && (
                  <Loader2 size={14} className={cn("animate-spin")} aria-hidden />
                )}
                {working ? "Confirming" : "Confirm swap"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="accent"
                disabled={!canQuote || quoting}
                onClick={onQuote}
              >
                {quoting && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {quoting ? "Quoting" : "Get quote"}
              </Button>
            ))}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
