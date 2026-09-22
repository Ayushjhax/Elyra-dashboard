"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatQty, truncateMiddle } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";

/* ---------------------------------------------------------------------------
   Sending tokens to an address — and, on the same code path, emptying the
   embedded wallet into one.

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

   ── Two things this used to get wrong ──────────────────────────────────

   1. THE ASSET LIST CAME FROM THE TRADING ALLOWLIST.

      It was `/api/swap/tokens` — about twenty symbols that are safe to
      resolve from a NAME, which is the right list for a swap and the wrong
      one here. A wallet holding anything else was offered no way to send it:
      the token was not in the dropdown, and the server would have refused
      the symbol anyway. Funds arrive in an embedded wallet that the operator
      cannot open in Phantom, so "not in the dropdown" meant "stuck".

      The list is now what the wallet ACTUALLY HOLDS, read from the same
      `/api/wallet` snapshot every other balance on screen comes from. The
      server re-checks the holding against the chain before it builds
      anything, so this list is a convenience, not the authority.

   2. IT CALLED `fetch` DIRECTLY.

      Every other authenticated call in the app goes through `useAuthedFetch`,
      which attaches Privy's access token as a bearer. This one relied on the
      `privy-token` cookie being present and configured, which is exactly the
      assumption `useAuthedFetch` exists to avoid — and when it is not, the
      build step answers 401 "Not signed in" to a user who is plainly signed
      in and looking at their own balance.

   MAX exists for the same reason the whole flow does. "Withdraw my holdings"
   means all of them, and asking someone to type their balance to the ninth
   decimal leaves dust behind every time. Native SOL can never send its full
   balance — the fee comes out of it — so the server computes the figure and
   holds back a few thousand lamports rather than letting the send bounce off
   simulation.

   ── A third thing this used to get wrong ───────────────────────────────

   3. "SENT" MEANT "BROADCAST", NOT "LANDED".

      `/api/transfer/submit` used to report success the instant the RPC
      handed back a signature — which only means the node accepted the
      transaction and forwarded it once. A broadcast that missed its leader,
      an ordinary event on a congested network, simply never lands, and this
      dialog had already said "Transfer sent" over money that was still
      sitting nowhere. That is exactly "I approved it but nothing arrived."

      The submit route now waits briefly for actual confirmation before
      answering. If it is still unresolved when that route's own window
      runs out, it reports PENDING rather than success, and this component
      takes over watching — polling `/api/transfer/status`, which
      re-broadcasts the same signed bytes on each check, until the chain
      gives a definite answer or the blockhash's window closes.

   4. THE WATCH RESTARTED EVERY TIME THE WALLET REFRESHED.

      The polling effect listed the wallet hook's return value among its
      dependencies, and that value is a new object every time the wallet
      store emits — every thirty seconds, by design. Each emit tore the
      effect down and started it again with a fresh clock, so the
      ninety-second give-up could never arrive: a transfer that had quietly
      expired spun forever as "waiting for the network". The effect now
      depends only on the transfer being watched; the fetcher and the
      refetch it calls are read through refs, and the clock belongs to the
      signature. It also hands `/api/transfer/status` the transaction's
      `lastValidBlockHeight`, so an expiry comes back as a definite answer
      — "nothing was sent, try again" — rather than a wall-clock guess.
--------------------------------------------------------------------------- */

/** One thing that can be sent, as the wallet snapshot describes it. */
interface Sendable {
  /** "SOL" for the native balance, otherwise the mint address. */
  mint: string;
  /** What to show. Falls back to the mint when nothing has vouched for it. */
  label: string;
  /** Scaled. For display only — the server sizes the transfer from chain. */
  amount: number;
  decimals: number;
  /** Jupiter recognises this mint. Unverified holdings are flagged, not hidden. */
  verified: boolean;
}

interface BuiltTransfer {
  unsignedTransaction?: string;
  /** The block height past which the unsigned bytes are dead. */
  lastValidBlockHeight?: number;
  summary?: string;
  to?: string;
  amount?: string;
  symbol?: string;
  /** SOL only, on a max send: the network fee, which the wallet pays out of
      the balance rather than the balance holding any of it back. Present so
      the confirm step can say why the wallet ends at zero rather than at
      some smaller, nonzero figure. */
  networkFee?: string | null;
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
  /**
   * "withdraw" is the same flow under the name people look for when they
   * want their money out. It changes the wording and nothing else — a
   * second dialog doing this over a second code path is how one of them
   * ends up with the careful address handling and the other does not.
   */
  intent = "transfer",
}: {
  address: string | null;
  onClose: () => void;
  intent?: "transfer" | "withdraw";
}) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const authedFetch = useAuthedFetch();
  const wallet = useWalletDashboard();

  const [mint, setMint] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [recipient, setRecipient] = useState("");

  const [built, setBuilt] = useState<BuiltTransfer | null>(null);
  const [building, setBuilding] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  /* Broadcast, but not yet confirmed — see the note above on why "sent" and
     "landed" are not the same claim. `pendingSignedBytes` is kept alongside
     the signature because `/api/transfer/status` re-broadcasts on every
     poll: that is the retry `maxRetries: 0` deliberately left for this app
     to make, and it needs the original bytes to make it. */
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [pendingSignedBytes, setPendingSignedBytes] = useState<string | null>(null);
  /* From the build step, kept with the rest of the pending transfer so the
     status route can tell "not yet" from "never" — see lesson 4 above. */
  const [pendingLastValidBlockHeight, setPendingLastValidBlockHeight] = useState<
    number | null
  >(null);
  const [pendingTimedOut, setPendingTimedOut] = useState(false);

  /* Read by the polling effect through refs rather than listed as its
     dependencies — see lesson 4 above. `authedFetch` is rebuilt whenever
     Privy's context changes and `wallet` whenever the store emits; neither
     is a reason to restart a watch that is already under way. Synced in
     effects, not during render, the same way `useWalletDashboard` hands its
     store a fetcher. */
  const authedFetchRef = useRef(authedFetch);
  const refetchWalletRef = useRef(wallet.refetch);
  useEffect(() => {
    authedFetchRef.current = authedFetch;
  }, [authedFetch]);
  useEffect(() => {
    refetchWalletRef.current = wallet.refetch;
  }, [wallet.refetch]);

  const title = intent === "withdraw" ? "Withdraw" : "Transfer";

  /* Watches a pending broadcast until the chain gives a definite answer.
     Polls every three seconds. Normally the answer is `/api/transfer/status`
     reporting the transaction expired — it knows the block height the bytes
     died at — but a wall-clock give-up stays as the backstop, at ninety
     seconds: comfortably past a blockhash's ~60-90 second validity, so it
     only fires when the definitive check could not be made.

     Keyed on the transfer alone. The clock starts when the signature is
     handed over and is not reset by anything else re-rendering. */
  useEffect(() => {
    if (pendingSignature === null) return;

    let cancelled = false;
    const startedAt = Date.now();
    const POLL_MS = 3_000;
    const GIVE_UP_AFTER_MS = 90_000;

    const tick = () => {
      void (async () => {
        if (cancelled) return;

        try {
          const response = await authedFetchRef.current("/api/transfer/status", {
            method: "POST",
            body: JSON.stringify({
              signature: pendingSignature,
              signedTransaction: pendingSignedBytes,
              lastValidBlockHeight: pendingLastValidBlockHeight,
            }),
          });
          const payload = (await response.json()) as {
            status?: "confirmed" | "failed" | "pending";
            signature?: string;
            error?: string;
          };
          if (cancelled) return;

          if (payload.status === "confirmed") {
            setSignature(pendingSignature);
            setPendingSignature(null);
            refetchWalletRef.current();
            return;
          }
          if (payload.status === "failed") {
            setError(payload.error ?? "The transfer did not confirm.");
            setPendingSignature(null);
            return;
          }
        } catch {
          /* A transient fetch failure while watching. Not the transfer
             failing — keep polling within the budget below. */
        }

        if (cancelled) return;
        if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
          setPendingTimedOut(true);
          return;
        }
        setTimeout(tick, POLL_MS);
      })();
    };

    const handle = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pendingSignature, pendingSignedBytes, pendingLastValidBlockHeight]);

  /* What this wallet can send, native balance first. Built from the snapshot
     the rest of the page is already reading, so the dropdown and the balance
     cards can never disagree about what is held. */
  const sendables = useMemo<Sendable[]>(() => {
    const snapshot = wallet.snapshot;
    if (snapshot === null) return [];

    const native: Sendable = {
      mint: "SOL",
      label: "SOL",
      amount: snapshot.sol,
      decimals: 9,
      verified: true,
    };

    const tokens = snapshot.tokens
      .filter((token) => token.amount > 0)
      .map<Sendable>((token) => ({
        mint: token.mint,
        label: token.symbol ?? truncateMiddle(token.mint, 4, 4),
        amount: token.amount,
        decimals: token.decimals,
        verified: token.verified,
      }));

    return [native, ...tokens];
  }, [wallet.snapshot]);

  const selected = sendables.find((entry) => entry.mint === mint) ?? null;

  const onReview = useCallback(() => {
    setError(null);
    setBuilding(true);

    void (async () => {
      try {
        const response = await authedFetch("/api/transfer/build", {
          method: "POST",
          body: JSON.stringify(
            sendMax
              ? { to: recipient, mint, max: true }
              : { to: recipient, mint, amount },
          ),
        });
        const payload = (await response.json()) as BuiltTransfer;
        if (!response.ok) {
          setError(payload.error ?? "That transfer could not be built.");
          return;
        }
        setBuilt(payload);
      } catch {
        setError("The server could not be reached.");
      } finally {
        setBuilding(false);
      }
    })();
  }, [authedFetch, recipient, mint, amount, sendMax]);

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

        const signer = wallets.find((entry) => entry.address === address) ?? wallets[0];
        if (signer === undefined) {
          setError("No Solana wallet is connected in this browser.");
          return;
        }

        const { signedTransaction } = await signTransaction({
          transaction: decodeBase64(unsigned),
          wallet: signer,
        });
        const encoded = encodeBase64(signedTransaction);

        const response = await authedFetch("/api/transfer/submit", {
          method: "POST",
          body: JSON.stringify({ signedTransaction: encoded }),
        });
        const payload = (await response.json()) as {
          status?: "confirmed" | "failed" | "pending";
          signature?: string;
          error?: string;
        };

        if (payload.status === "confirmed" && typeof payload.signature === "string") {
          setSignature(payload.signature);
          /* The balance on screen is now a reading from before the send. */
          wallet.refetch();
          return;
        }

        if (payload.status === "pending" && typeof payload.signature === "string") {
          /* Broadcast, not yet confirmed — see the note on this route's own
             short window. Handed off to the polling effect above rather
             than shown as either success or failure, because it is
             genuinely neither yet. */
          setPendingSignedBytes(encoded);
          setPendingLastValidBlockHeight(built?.lastValidBlockHeight ?? null);
          setPendingSignature(payload.signature);
          return;
        }

        setError(payload.error ?? "The transfer was not accepted.");
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
  }, [built, wallets, address, signTransaction, authedFetch, wallet]);

  const canReview =
    (sendMax || amount.trim().length > 0) &&
    looksLikeAddress(recipient) &&
    address !== null &&
    !building;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="glass" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>{title}</Eyebrow>
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
                <p className="type-label text-positive">
                  Sent {built?.amount} {built?.symbol}.
                </p>
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
          ) : pendingSignature !== null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-raised px-3 py-2.5">
                {pendingTimedOut ? (
                  <AlertTriangle size={14} className="shrink-0 text-negative" aria-hidden />
                ) : (
                  <Loader2 size={14} className="shrink-0 animate-spin text-text-secondary" aria-hidden />
                )}
                <p className="type-label text-text-secondary">
                  {pendingTimedOut
                    ? "Still not confirmed after 90 seconds."
                    : "Broadcast — waiting for the network to confirm it."}
                </p>
              </div>

              <p className="type-label text-text-muted">
                {pendingTimedOut
                  ? "It may still land, or the transaction may have expired unconfirmed. Check the explorer with this signature before assuming either way."
                  : "This can take a few seconds on a busy network. Keep this open until it resolves."}
              </p>

              <a
                href={txExplorerUrl(pendingSignature)}
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

              {typeof built.networkFee === "string" && (
                <p className="type-label text-text-muted">
                  This empties the wallet — {built.networkFee} SOL of the
                  balance pays the network fee, and nothing is left behind.
                </p>
              )}

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
                  {/* Under Max this says "Everything" rather than showing a
                      figure, and that is deliberate. The exact amount is not
                      known here: for SOL the server subtracts the fee reserve,
                      so pouring the displayed balance into the field would put
                      a number in front of the operator that is not the number
                      about to leave. The confirm step shows the real one, from
                      the base units that will go on-chain. */}
                  <input
                    inputMode="decimal"
                    value={sendMax ? "Everything" : amount}
                    readOnly={sendMax}
                    onFocus={() => {
                      if (!sendMax) return;
                      setSendMax(false);
                      setAmount("");
                    }}
                    onChange={(event) => {
                      setSendMax(false);
                      setAmount(event.target.value);
                    }}
                    placeholder="0.00"
                    aria-label="Amount to send"
                    className="type-data min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
                  />

                  {/* Max is a FLAG, not a number poured into the field. The
                      exact figure is the chain's, and for SOL it is the
                      balance less the fee — computed on the server, where the
                      balance is authoritative, rather than from the rounded
                      display figure sitting next to it. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSendMax(true);
                      setAmount("");
                    }}
                    disabled={selected === null || selected.amount <= 0}
                    className="type-label rounded-chip border border-border-subtle px-2 py-1 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:text-text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Max
                  </button>

                  <select
                    value={mint}
                    onChange={(event) => {
                      setMint(event.target.value);
                      setSendMax(false);
                      setAmount("");
                    }}
                    aria-label="Token to send"
                    className="type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary"
                  >
                    {sendables.map((entry) => (
                      <option key={entry.mint} value={entry.mint}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="type-label text-text-muted">
                    {selected === null
                      ? wallet.isLoading
                        ? "Reading balances…"
                        : "No balance to send"
                      : `Balance ${formatQty(selected.amount, 6)} ${selected.label}`}
                  </span>
                  {sendMax && (
                    <span className="type-label text-accent">
                      {mint === "SOL" ? "Less the network fee" : "The whole balance"}
                    </span>
                  )}
                </div>
              </div>

              {selected !== null && !selected.verified && (
                <p className="type-label text-text-muted">
                  Nothing has vouched for this token. Check the mint before sending it.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <Eyebrow>{intent === "withdraw" ? "Destination address" : "Recipient address"}</Eyebrow>
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Paste your Solana address"
                  aria-label="Destination address"
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
            onClick={
              built !== null && signature === null && pendingSignature === null
                ? () => setBuilt(null)
                : onClose
            }
          >
            {signature !== null
              ? "Done"
              : pendingSignature !== null
                ? "Close"
                : built !== null
                  ? "Back"
                  : "Cancel"}
          </Button>

          {signature === null &&
            pendingSignature === null &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={working} onClick={onConfirm}>
                {working && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {working ? "Sending" : `Confirm ${title.toLowerCase()}`}
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
