"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { AlertTriangle, ArrowDown, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetPassportDialog } from "@/components/assets/AssetPassport";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { isSolanaAddress, txExplorerUrl } from "@/lib/solana/address";
import { truncateMiddle } from "@/lib/format";
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

   Either side may be "Other token…" — any mint, typed in. The server reads
   it from the chain and refuses it until the person ticks that they have
   checked it; its Asset Passport is one tap away, and the quote carries its
   live mint controls as warnings.
--------------------------------------------------------------------------- */

const OTHER = "__other";

const PICKER = "type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary";
const MINT_FIELD =
  "type-mono-addr h-10 w-full rounded-control border border-border-subtle bg-surface-base px-3 text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";

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
  /* A prefill may be a mint — a sale of an unlisted holding starts there. */
  const [fromSymbol, setFromSymbol] = useState(isSolanaAddress(initialFrom) ? OTHER : initialFrom);
  const [toSymbol, setToSymbol] = useState(isSolanaAddress(initialTo) ? OTHER : initialTo);
  const [fromMint, setFromMint] = useState(isSolanaAddress(initialFrom) ? initialFrom : "");
  const [toMint, setToMint] = useState(isSolanaAddress(initialTo) ? initialTo : "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [passport, setPassport] = useState<string | null>(null);
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

  const sellsOther = fromSymbol === OTHER;
  const buysOther = toSymbol === OTHER;
  const request = useMemo(
    () => ({
      fromSymbol: sellsOther ? "" : fromSymbol,
      toSymbol: buysOther ? "" : toSymbol,
      amount,
      ...(sellsOther ? { fromMint: fromMint.trim() } : {}),
      ...(buysOther ? { toMint: toMint.trim() } : {}),
      acknowledgeUnverified: (sellsOther || buysOther) && acknowledged,
    }),
    [sellsOther, buysOther, fromSymbol, toSymbol, fromMint, toMint, amount, acknowledged],
  );

  const onQuote = useCallback(() => {
    setError(null);
    setSignature(null);
    setQuoting(true);
    void buildSwap(authedFetch, request)
      .then((payload) => {
        if (payload.error !== undefined) setError(payload.error);
        else setQuote(payload);
      })
      .finally(() => setQuoting(false));
  }, [authedFetch, request]);

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
      request,
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
  }, [authedFetch, request, wallets, address, signTransaction, onExecuted]);

  const symbols = groups.flatMap((group) => group.symbols);
  const mintsValid = (!sellsOther || isSolanaAddress(fromMint.trim())) && (!buysOther || isSolanaAddress(toMint.trim()));
  const sameToken = sellsOther && buysOther ? fromMint.trim() === toMint.trim() : fromSymbol === toSymbol;
  const canQuote =
    amount.trim().length > 0 &&
    !sameToken &&
    mintsValid &&
    (!(sellsOther || buysOther) || acknowledged) &&
    address !== null &&
    !working;
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
                    className={PICKER}
                  >
                    {symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                    <option value={OTHER}>Other token…</option>
                  </select>
                </div>
                {sellsOther && (
                  <MintField
                    value={fromMint}
                    label="Mint of the token to sell"
                    onChange={(value) => {
                      setFromMint(value);
                      setQuote(null);
                    }}
                    onPassport={setPassport}
                  />
                )}

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
                    className={PICKER}
                  >
                    {symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                    <option value={OTHER}>Other token…</option>
                  </select>
                </div>
                {buysOther && (
                  <MintField
                    value={toMint}
                    label="Mint of the token to buy"
                    onChange={(value) => {
                      setToMint(value);
                      setQuote(null);
                    }}
                    onPassport={setPassport}
                  />
                )}
              </div>

              {(sellsOther || buysOther) && (
                <label className="type-label flex items-start gap-2 text-text-secondary">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => {
                      setAcknowledged(event.target.checked);
                      setQuote(null);
                    }}
                    className="mt-0.5"
                  />
                  I have checked this mint and its Asset Passport. Anyone can create a token under any name; Elyra has not
                  verified this one and will not value or count it.
                </label>
              )}

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
      {passport !== null && (
        <AssetPassportDialog mint={passport} symbol={truncateMiddle(passport, 4, 4)} onClose={() => setPassport(null)} />
      )}
    </Dialog>
  );
}

/** A typed mint, checked as it is typed, with its passport a tap away. */
function MintField({
  value,
  label,
  onChange,
  onPassport,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onPassport: (mint: string) => void;
}) {
  const typed = value.trim();
  const valid = isSolanaAddress(typed);
  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Token mint address"
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        className={MINT_FIELD}
      />
      {typed.length > 0 && !valid ? (
        <p className="type-label text-negative">That is not a Solana mint address.</p>
      ) : valid ? (
        <button
          type="button"
          onClick={() => onPassport(typed)}
          className="type-label self-start text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Check its Asset Passport
        </button>
      ) : null}
    </div>
  );
}
