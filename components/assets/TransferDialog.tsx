"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { txExplorerUrl } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   Sending tokens to an address.

   The dangerous field here is the address, not the amount. A swap that goes
   wrong loses a little to slippage; a transfer to the wrong address is gone,
   permanently, with no counterparty to appeal to. So this dialog spends its
   care there:

     - the address is validated as you type, not on submit
     - it is shown back IN FULL on the confirm step, never truncated, because
       the middle of an address is exactly where a wrong one differs
     - there is a distinct confirm step; the first button quotes nothing and
       sends nothing

   The three steps mirror the swap dialog: build on the server, sign in this
   browser through Privy, submit the signed bytes back.
--------------------------------------------------------------------------- */

interface TokenGroup {
  label: string;
  symbols: string[];
}

interface BuiltTransfer {
  unsignedTransaction?: string;
  summary?: string;
  to?: string;
  error?: string;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * A cheap client-side shape check, to catch a bad paste before a round trip.
 *
 * Deliberately NOT the authority: base58 length and alphabet say nothing
 * about whether an address is on the ed25519 curve. The server validates
 * properly, and this only exists so the Review button can stay disabled
 * while the field is obviously incomplete.
 */
function looksLikeAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function TransferDialog({
  address,
  onClose,
}: {
  address: string | null;
  onClose: () => void;
}) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const [groups, setGroups] = useState<TokenGroup[]>([]);
  const [symbol, setSymbol] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const [built, setBuilt] = useState<BuiltTransfer | null>(null);
  const [building, setBuilding] = useState(false);
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onReview = useCallback(() => {
    setError(null);
    setBuilding(true);

    void (async () => {
      try {
        const response = await fetch("/api/transfer/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: recipient, symbol, amount }),
        });
        const payload = (await response.json()) as BuiltTransfer;
        if (!response.ok) {
          setError(payload.error ?? "That transfer could not be built.");
          return;
        }
        setBuilt(payload);
      } finally {
        setBuilding(false);
      }
    })();
  }, [recipient, symbol, amount]);

  const onConfirm = useCallback(() => {
    setError(null);
    setWorking(true);

    void (async () => {
      try {
        const unsigned = built?.unsignedTransaction;
        if (typeof unsigned !== "string") {
          setError("There is nothing to sign.");
          return;
        }

        const wallet = wallets.find((entry) => entry.address === address) ?? wallets[0];
        if (wallet === undefined) {
          setError("No Solana wallet is connected in this browser.");
          return;
        }

        const { signedTransaction } = await signTransaction({
          transaction: decodeBase64(unsigned),
          wallet,
        });

        const response = await fetch("/api/transfer/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ signedTransaction: encodeBase64(signedTransaction) }),
        });
        const payload = (await response.json()) as {
          signature?: string;
          error?: string;
        };

        if (!response.ok || typeof payload.signature !== "string") {
          setError(payload.error ?? "The transfer was not accepted.");
          return;
        }

        setSignature(payload.signature);
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : "";
        setError(
          /reject|denied|cancel|closed/i.test(message)
            ? "Cancelled — nothing was signed or sent."
            : message.length > 0
              ? message
              : "The transfer could not be completed.",
        );
      } finally {
        setWorking(false);
      }
    })();
  }, [built, wallets, address, signTransaction]);

  const symbols = groups.flatMap((group) => group.symbols);
  const canReview =
    amount.trim().length > 0 &&
    looksLikeAddress(recipient) &&
    address !== null &&
    !building;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="glass" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Transfer</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Send tokens from your wallet to another Solana address.
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {signature !== null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-card border border-positive/40 bg-positive-bg px-3 py-2.5">
                <Check size={14} className="text-positive" aria-hidden />
                <p className="type-label text-positive">Transfer sent.</p>
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
          ) : built !== null ? (
            <>
              <p className="type-body-sm text-text-secondary">{built.summary}</p>

              {/* In full, and breakable. A truncated address on a confirm
                  screen hides the characters a wrong one differs by. */}
              <div className="rounded-card border border-border-subtle bg-surface-raised p-3">
                <Eyebrow>To</Eyebrow>
                <p className="type-mono-addr mt-1 break-all text-text-primary">
                  {built.to}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden />
                <p className="type-label text-text-secondary">
                  Check the address. A transfer cannot be reversed or recalled.
                </p>
              </div>

              {error !== null && (
                <div role="alert" className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                  <p className="type-label text-negative">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    aria-label="Amount to send"
                    className="type-data min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
                  />
                  <select
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value)}
                    aria-label="Token to send"
                    className="type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary"
                  >
                    {symbols.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Eyebrow>Recipient address</Eyebrow>
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Solana address"
                  aria-label="Recipient address"
                  spellCheck={false}
                  autoComplete="off"
                  className="type-mono-addr w-full rounded-control border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-ring"
                />
                {recipient.trim().length > 0 && !looksLikeAddress(recipient) && (
                  <p className="type-label text-negative">
                    That does not look like a Solana address.
                  </p>
                )}
              </div>

              {address === null && (
                <p className="type-label text-text-muted">
                  Connect a Solana wallet to send.
                </p>
              )}

              {error !== null && (
                <div role="alert" className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                  <p className="type-label text-negative">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button
            size="sm"
            variant="quiet"
            onClick={built !== null && signature === null ? () => setBuilt(null) : onClose}
          >
            {signature !== null ? "Done" : built !== null ? "Back" : "Cancel"}
          </Button>

          {signature === null &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={working} onClick={onConfirm}>
                {working && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {working ? "Sending" : "Confirm send"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={!canReview} onClick={onReview}>
                {building && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {building ? "Checking" : "Review"}
              </Button>
            ))}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
