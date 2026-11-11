"use client";

import { useCallback, useMemo, useState } from "react";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { AlertTriangle, ArrowDown, Check, Loader2 } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ErrorBox, ExplorerLink, FIELD, Row, SELECT } from "@/components/wallet/EvmDialogs";
import { formatQty, formatUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { isCoinType, isSuiAddress, suiScopeId } from "@/lib/sui/chain";
import { SUI_TOKENS } from "@/lib/sui/tokens";
import type { BuiltSuiStep } from "@/lib/sui/wire";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { runSuiTx, type SuiTxRun } from "@/lib/wallet/runSuiTx";

/* ---------------------------------------------------------------------------
   Sending and swapping on Sui.

   The same contract as every other chain here: the server builds and
   simulates the transaction for the session's own Sui address and seals it;
   Privy's embedded Sui wallet signs the hash of it in this browser; the
   server checks the signature against that address and executes
   (lib/sui/tx.ts). Sui finalises in under a second, so the dialog shows the
   outcome, not a wait. The recipient is shown back IN FULL before signing.

   Buying any coin is allowed by its full Move type — "Other coin" — and a
   coin on no trusted list needs the person to say, explicitly, that they
   have checked it.
--------------------------------------------------------------------------- */

function useSuiSigner(): { address: string | null; publicKey: string | null; sign: (hash: `0x${string}`) => Promise<string> } {
  const auth = useElyraAuth();
  const { signRawHash } = useSignRawHash();
  const address = isSuiAddress(auth.suiAddress) ? auth.suiAddress : null;
  const sign = useCallback(
    async (hash: `0x${string}`) => {
      if (address === null) throw new Error("This account has no Sui wallet yet.");
      const { signature } = await signRawHash({ address, chainType: "sui", hash });
      return signature;
    },
    [address, signRawHash],
  );
  return { address, publicKey: auth.suiPublicKey, sign };
}

function Done({ run, done }: { run: SuiTxRun; done: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          run.ok
            ? "flex items-center gap-2 rounded-card border border-positive/40 bg-positive-bg px-3 py-2.5"
            : "flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5"
        }
      >
        {run.ok ? <Check size={14} className="text-positive" aria-hidden /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden />}
        <p className={run.ok ? "type-label text-positive" : "type-label text-text-secondary"}>{run.ok ? done : run.error}</p>
      </div>
      <ExplorerLink href={run.href} />
    </div>
  );
}

function Shell({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>{title}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">{footer}</footer>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Send
--------------------------------------------------------------------------- */

interface BuiltSuiSend extends BuiltSuiStep {
  to: string;
  amount: string;
  symbol: string;
  verified: boolean;
  native: boolean;
}

export function SuiSendDialog({ initialCoin = "SUI", onClose }: { initialCoin?: string; onClose: () => void }) {
  const signer = useSuiSigner();
  const feed = usePortfolio();
  const authedFetch = useAuthedFetch();
  const [coin, setCoin] = useState(initialCoin);
  const [amount, setAmount] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [built, setBuilt] = useState<BuiltSuiSend | null>(null);
  const [busy, setBusy] = useState<"building" | "sending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SuiTxRun | null>(null);

  const options = useMemo(() => {
    if (feed.snapshot === null || signer.address === null) return [{ value: "SUI", label: "SUI", quantity: 0, verified: true }];
    const scope = suiScopeId(signer.address);
    const rows = feed.snapshot.spot
      .filter((holding) => holding.scopeId === scope && holding.quantity > 0)
      .map((holding) => ({ value: holding.address ?? "SUI", label: holding.symbol, quantity: holding.quantity, verified: holding.verified }));
    return rows.some((row) => row.value === "SUI") ? rows : [{ value: "SUI", label: "SUI", quantity: 0, verified: true }, ...rows];
  }, [feed.snapshot, signer.address]);
  const selected = options.find((option) => option.value === coin) ?? null;
  const trimmed = recipient.trim();

  const review = async () => {
    setError(null);
    setBusy("building");
    try {
      const response = await authedFetch("/api/sui/transfer/build", {
        method: "POST",
        body: JSON.stringify({ coin, to: trimmed, ...(sendMax ? { max: true } : { amount }) }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<BuiltSuiSend> & { error?: string };
      if (!response.ok || payload.tx === undefined) setError(payload.error ?? "That send could not be prepared.");
      else setBuilt(payload as BuiltSuiSend);
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (built === null) return;
    setError(null);
    setBusy("sending");
    const result = await runSuiTx(authedFetch, signer.sign, built, signer.publicKey);
    setBusy(null);
    if (!result.ok && result.digest === undefined) {
      setError(result.error);
      return;
    }
    setRun(result);
    if (result.ok) feed.refetch();
  };

  const canReview = signer.address !== null && busy === null && isSuiAddress(trimmed) && (sendMax || amount.trim().length > 0);

  return (
    <Shell
      title="Send on Sui"
      description="Send SUI or a coin from your Sui wallet."
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="quiet" onClick={built !== null && run === null && busy === null ? () => setBuilt(null) : onClose}>
            {run?.ok === true ? "Done" : run !== null ? "Close" : built !== null ? "Back" : "Cancel"}
          </Button>
          {signer.address !== null && run === null &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => void confirm()}>
                {busy === "sending" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "sending" ? "Sending" : "Confirm send"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={!canReview} onClick={() => void review()}>
                {busy === "building" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "building" ? "Checking" : "Review"}
              </Button>
            ))}
        </>
      }
    >
      {signer.address === null ? (
        <p className="type-body-sm text-text-secondary">This account has no Sui wallet yet. Open the wallet to set one up.</p>
      ) : run !== null ? (
        <Done run={run} done={`Sent ${built?.amount ?? ""} ${built?.symbol ?? ""} on Sui.`} />
      ) : built !== null ? (
        <>
          <p className="type-body-sm text-text-secondary">{built.summary}</p>
          <div className="rounded-card border border-border-subtle bg-surface-raised p-3">
            <Eyebrow>To</Eyebrow>
            <p className="type-mono-addr mt-1 break-all text-text-primary">{built.to}</p>
          </div>
          {!built.verified && <p className="type-label text-text-muted">{built.symbol} is not on Elyra&rsquo;s verified list. Check the coin before sending it.</p>}
          <p className="type-label text-text-muted">Network fee: up to {built.networkFeeMax} SUI.</p>
          <div className="flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden />
            <p className="type-label text-text-secondary">Check the address. A send cannot be reversed, and funds sent on Sui arrive only on Sui.</p>
          </div>
          <ErrorBox error={error} />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => {
                  setSendMax(true);
                  setAmount("");
                }}
                disabled={selected === null || selected.quantity <= 0}
                className="type-label rounded-chip border border-border-subtle px-2 py-1 text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Max
              </button>
              <select value={selected?.value ?? coin} onChange={(event) => setCoin(event.target.value)} aria-label="Coin to send" className={SELECT}>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="type-label text-text-muted">
              {selected === null ? "No balance to send" : `Balance ${formatQty(selected.quantity, 6)} ${selected.label} on Sui`}
            </span>
          </div>
          <Eyebrow>Recipient address</Eyebrow>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="0x… (64 hex characters)"
            aria-label="Recipient address"
            spellCheck={false}
            autoComplete="off"
            className={FIELD}
          />
          {trimmed.length > 0 && !isSuiAddress(trimmed) && (
            <p className="type-label text-negative">That does not look like a Sui address (0x followed by 64 hex characters).</p>
          )}
          <ErrorBox error={error} />
        </>
      )}
    </Shell>
  );
}

/* ---------------------------------------------------------------------------
   Swap — any coin, by type
--------------------------------------------------------------------------- */

interface BuiltSuiSwap extends BuiltSuiStep {
  quote: {
    sellSymbol: string;
    buySymbol: string;
    sellAmount: string;
    buyAmount: string;
    buyAmountMin: string;
    slippagePct: number;
    route: string;
    routeFeeUsd: number | null;
    buyVerified: boolean;
  };
}

const OTHER = "__other";

export function SuiSwapDialog({ initialFrom = "SUI", onClose }: { initialFrom?: string; onClose: () => void }) {
  const signer = useSuiSigner();
  const feed = usePortfolio();
  const authedFetch = useAuthedFetch();
  const [from, setFrom] = useState(SUI_TOKENS.some((token) => token.symbol === initialFrom) ? initialFrom : "SUI");
  const [to, setTo] = useState("USDC");
  const [otherType, setOtherType] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [amount, setAmount] = useState("");
  const [built, setBuilt] = useState<BuiltSuiSwap | null>(null);
  const [busy, setBusy] = useState<"quoting" | "signing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SuiTxRun | null>(null);

  const target = to === OTHER ? otherType.trim() : to;
  const held = useMemo(() => {
    if (feed.snapshot === null || signer.address === null) return null;
    const scope = suiScopeId(signer.address);
    return feed.snapshot.spot.filter((holding) => holding.scopeId === scope && holding.symbol === from).reduce((sum, holding) => sum + holding.quantity, 0);
  }, [feed.snapshot, signer.address, from]);

  const review = async () => {
    setError(null);
    setBusy("quoting");
    try {
      const response = await authedFetch("/api/sui/swap/build", {
        method: "POST",
        body: JSON.stringify({ from, to: target, amount, acknowledgeUnverified: to === OTHER && acknowledged }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<BuiltSuiSwap> & { error?: string };
      if (!response.ok || payload.tx === undefined) setError(payload.error ?? "That swap could not be quoted.");
      else setBuilt(payload as BuiltSuiSwap);
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (built === null) return;
    setError(null);
    setBusy("signing");
    const result = await runSuiTx(authedFetch, signer.sign, built, signer.publicKey);
    setBusy(null);
    if (!result.ok && result.digest === undefined) {
      setError(result.error);
      return;
    }
    setRun(result);
    if (result.ok) feed.refetch();
  };

  const otherValid = to !== OTHER || (isCoinType(otherType) && acknowledged);
  const canReview = signer.address !== null && busy === null && amount.trim().length > 0 && target !== from && otherValid;

  return (
    <Shell
      title="Swap on Sui"
      description="Swap between SUI and any coin on Sui."
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="quiet" onClick={built !== null && run === null && busy === null ? () => setBuilt(null) : onClose}>
            {run?.ok === true ? "Done" : run !== null ? "Close" : built !== null ? "Back" : "Cancel"}
          </Button>
          {signer.address !== null && run === null &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => void confirm()}>
                {busy === "signing" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "signing" ? "Signing" : "Confirm swap"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={!canReview} onClick={() => void review()}>
                {busy === "quoting" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "quoting" ? "Quoting" : "Review"}
              </Button>
            ))}
        </>
      }
    >
      {signer.address === null ? (
        <p className="type-body-sm text-text-secondary">This account has no Sui wallet yet. Open the wallet to set one up.</p>
      ) : run !== null ? (
        <Done run={run} done={`Swapped ${built?.quote.sellAmount ?? ""} ${built?.quote.sellSymbol ?? ""} for ${built?.quote.buySymbol ?? ""} on Sui.`} />
      ) : built !== null ? (
        <>
          <dl className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-raised p-3">
            <Row label="You sell" value={`${built.quote.sellAmount} ${built.quote.sellSymbol}`} />
            <Row label="You receive" value={`≈ ${built.quote.buyAmount} ${built.quote.buySymbol}`} />
            <Row label="At least" value={`${built.quote.buyAmountMin} ${built.quote.buySymbol} (${built.quote.slippagePct}% slippage)`} />
            <Row label="Route" value={`${built.quote.route} via LI.FI`} />
            {built.quote.routeFeeUsd !== null && <Row label="Route fee" value={`${formatUsd(built.quote.routeFeeUsd)}, taken from the swap`} />}
          </dl>
          {!built.quote.buyVerified && (
            <p className="type-label text-caution">{built.quote.buySymbol} is not on Elyra&rsquo;s verified list. It will be shown in your wallet but never counted.</p>
          )}
          <p className="type-label text-text-muted">Network fee: up to {built.networkFeeMax} SUI. The swap was simulated and delivers at least the minimum above.</p>
          <ErrorBox error={error} />
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
                aria-label="Amount to sell"
                className="type-data min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
              />
              <select value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Coin to sell" className={SELECT}>
                {SUI_TOKENS.map((token) => (
                  <option key={token.coinType} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
            <span className="type-label text-text-muted">{held === null ? "Reading balances…" : `Balance ${formatQty(held, 6)} ${from} on Sui`}</span>
          </div>
          <ArrowDown size={14} className="mx-auto text-text-muted" aria-hidden />
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="type-body-sm text-text-secondary">Receive</span>
              <select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Coin to buy" className={SELECT}>
                {SUI_TOKENS.map((token) => (
                  <option key={token.coinType} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
                <option value={OTHER}>Other coin…</option>
              </select>
            </div>
            {to === OTHER && (
              <>
                <input
                  value={otherType}
                  onChange={(event) => setOtherType(event.target.value)}
                  placeholder="0x…::module::NAME"
                  aria-label="Coin type to buy"
                  spellCheck={false}
                  autoComplete="off"
                  className={FIELD}
                />
                {otherType.trim().length > 0 && !isCoinType(otherType) && (
                  <p className="type-label text-negative">That is not a Sui coin type (0x…::module::NAME).</p>
                )}
                <label className="type-label flex items-start gap-2 text-text-secondary">
                  <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" />
                  I have checked this coin type. Anyone can create a coin under any name; Elyra has not verified this one and will not count it.
                </label>
              </>
            )}
          </div>
          <p className="type-label text-text-muted">Quoted by LI.FI, which charges its own fee; the quote shows it.</p>
          <ErrorBox error={error} />
        </>
      )}
    </Shell>
  );
}
