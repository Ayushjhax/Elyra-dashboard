"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSignTransaction } from "@privy-io/react-auth";
import { AlertTriangle, ArrowDown, Check, ExternalLink, Loader2 } from "lucide-react";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { EVM_CHAINS, evmScopeId, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { swapTokens } from "@/lib/evm/swap";
import type { BuiltEvmStep, EvmTxRequest } from "@/lib/evm/wire";
import { formatQty, formatUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { runEvmTx, type EvmTxRun } from "@/lib/wallet/runEvmTx";

/* ---------------------------------------------------------------------------
   Sending and swapping on Ethereum and Robinhood Chain.

   The Solana dialogs' rules, kept: the server builds every transaction for
   the session's own address, the person's wallet signs it in this browser,
   the server checks it against what it built and sends it, and nothing says
   "sent" until the chain says so (lib/wallet/runEvmTx.ts). The recipient is
   validated as it is typed and shown back IN FULL on the confirm step,
   because the middle of an address is where a wrong one differs.

   Only Elyra's embedded EVM wallet can sign here. Privy signs a transaction
   without broadcasting it — which is what lets the server check it first —
   and an external wallet such as MetaMask does not offer that; for a linked
   external wallet, the dialog says to use that wallet's own app.
--------------------------------------------------------------------------- */

/** The session's EVM wallet, and whether Elyra's embedded wallet holds its key. */
export function useEvmWallet(): { address: string | null; embedded: boolean } {
  return evmWalletOf(useElyraAuth());
}

/** As `useEvmWallet`, from an auth value already in hand — for views rendered from fixtures. */
export function evmWalletOf(auth: Pick<ElyraAuth, "walletAddress" | "account">): { address: string | null; embedded: boolean } {
  const address = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  const embedded =
    address !== null &&
    (auth.account?.accounts ?? []).some(
      (entry) =>
        entry.type === "wallet" &&
        entry.chainType === "ethereum" &&
        entry.walletClientType === "privy" &&
        entry.detail?.toLowerCase() === address.toLowerCase(),
    );
  return { address, embedded };
}

/** Privy's embedded-wallet signer, handed a transaction with every field fixed. */
function useEvmSigner(): (tx: EvmTxRequest, summary: string) => Promise<string> {
  const { signTransaction } = useSignTransaction();
  return useCallback(
    async (tx: EvmTxRequest, summary: string) => {
      const { signature } = await signTransaction(
        {
          from: tx.from,
          to: tx.to,
          value: BigInt(tx.value),
          data: tx.data,
          chainId: tx.chainId,
          nonce: tx.nonce,
          gasLimit: BigInt(tx.gas),
          maxFeePerGas: BigInt(tx.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
          type: 2,
        },
        { address: tx.from, uiOptions: { description: summary, buttonText: "Sign" } },
      );
      return signature;
    },
    [signTransaction],
  );
}

const FIELD =
  "type-mono-addr w-full rounded-control border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring";

const SELECT =
  "type-data-sm rounded-control border border-border-subtle bg-surface-base px-2 py-1 text-text-primary";

function ErrorBox({ error }: { error: string | null }) {
  if (error === null) return null;
  return (
    <div role="alert" className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
      <p className="type-label text-negative">{error}</p>
    </div>
  );
}

function ExplorerLink({ href, label = "View on explorer" }: { href: string | null | undefined; label?: string }) {
  if (href === null || href === undefined) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="type-label flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
    >
      <ExternalLink size={12} aria-hidden />
      {label}
    </a>
  );
}

/** What happened, once something was signed. */
function Outcome({ run, pending, done }: { run: EvmTxRun | null; pending: { href: string | null } | null; done: string }) {
  if (run?.ok === true) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-card border border-positive/40 bg-positive-bg px-3 py-2.5">
          <Check size={14} className="text-positive" aria-hidden />
          <p className="type-label text-positive">{done}</p>
        </div>
        <ExplorerLink href={run.href} />
      </div>
    );
  }
  if (run !== null && run.ok === false && run.hash !== undefined) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden />
          <p className="type-label text-text-secondary">{run.error}</p>
        </div>
        <ExplorerLink href={run.href} />
      </div>
    );
  }
  if (pending !== null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-raised px-3 py-2.5">
          <Loader2 size={14} className="shrink-0 animate-spin text-text-secondary" aria-hidden />
          <p className="type-label text-text-secondary">Broadcast — waiting for the network to confirm it.</p>
        </div>
        <p className="type-label text-text-muted">
          Ethereum blocks come every twelve seconds and a busy network can take longer. Keep this open until it resolves.
        </p>
        <ExplorerLink href={pending.href} />
      </div>
    );
  }
  return null;
}

function NotSignable({ chain }: { chain: EvmChainKey }) {
  return (
    <p className="type-body-sm text-text-secondary">
      Your EVM wallet on this account is a linked external wallet. Elyra signs only with its own embedded wallet, so send
      or swap on {EVM_CHAINS[chain].name} from that wallet&rsquo;s own app.
    </p>
  );
}

/* ---------------------------------------------------------------------------
   Send
--------------------------------------------------------------------------- */

interface BuiltSend extends BuiltEvmStep {
  to: string;
  amount: string;
  symbol: string;
  verified: boolean;
  toIsContract: boolean;
}

export function EvmSendDialog({
  chain,
  initialAsset = "native",
  onClose,
}: {
  chain: EvmChainKey;
  /** "native" for ETH, or a token contract. */
  initialAsset?: string;
  onClose: () => void;
}) {
  const network = EVM_CHAINS[chain].name;
  const wallet = useEvmWallet();
  const feed = usePortfolio();
  const authedFetch = useAuthedFetch();
  const sign = useEvmSigner();

  const [asset, setAsset] = useState(initialAsset);
  const [amount, setAmount] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [built, setBuilt] = useState<BuiltSend | null>(null);
  const [busy, setBusy] = useState<"building" | "sending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ href: string | null } | null>(null);
  const [run, setRun] = useState<EvmTxRun | null>(null);
  const abort = useRef<AbortController | null>(null);

  /* What this wallet holds on this chain, from the portfolio store every
     other balance reads. The server re-reads the chain before building, so
     this list is a convenience, not the authority. */
  const holdings = useMemo(() => {
    if (feed.snapshot === null || wallet.address === null) return [];
    const scope = evmScopeId(chain, wallet.address);
    return feed.snapshot.spot.filter((holding) => holding.scopeId === scope && holding.quantity > 0);
  }, [feed.snapshot, wallet.address, chain]);
  const options = useMemo(() => {
    const rows = holdings.map((holding) => ({ value: holding.address ?? "native", label: holding.symbol, quantity: holding.quantity, verified: holding.verified }));
    return rows.some((row) => row.value === "native") ? rows : [{ value: "native", label: "ETH", quantity: 0, verified: true }, ...rows];
  }, [holdings]);
  const selected = options.find((option) => option.value.toLowerCase() === asset.toLowerCase()) ?? null;

  const review = useCallback(() => {
    setError(null);
    setBusy("building");
    void (async () => {
      try {
        const response = await authedFetch("/api/evm/transfer/build", {
          method: "POST",
          body: JSON.stringify({ chain, asset, to: recipient.trim(), ...(sendMax ? { max: true } : { amount }) }),
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<BuiltSend> & { error?: string };
        if (!response.ok || payload.tx === undefined) {
          setError(payload.error ?? "That send could not be prepared.");
          return;
        }
        setBuilt(payload as BuiltSend);
      } catch {
        setError("The server could not be reached.");
      } finally {
        setBusy(null);
      }
    })();
  }, [authedFetch, chain, asset, recipient, sendMax, amount]);

  const confirm = useCallback(() => {
    if (built === null) return;
    setError(null);
    setBusy("sending");
    abort.current = new AbortController();
    void (async () => {
      const result = await runEvmTx(authedFetch, sign, built, {
        onBroadcast: (_hash, href) => setPending({ href }),
        signal: abort.current?.signal,
      });
      setBusy(null);
      setPending(null);
      if (!result.ok && result.hash === undefined) {
        setError(result.error);
        return;
      }
      setRun(result);
      if (result.ok) feed.refetch();
    })();
  }, [built, authedFetch, sign, feed]);

  const close = () => {
    abort.current?.abort();
    onClose();
  };

  const addressTyped = recipient.trim();
  const canReview =
    wallet.embedded && busy === null && isEvmAddress(addressTyped) && (sendMax || amount.trim().length > 0);
  const finished = run !== null || pending !== null;

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Send on {network}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">Send ETH or a token from your EVM wallet on {network}.</DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {!wallet.embedded ? (
            <NotSignable chain={chain} />
          ) : finished ? (
            <Outcome run={run} pending={pending} done={`Sent ${built?.amount ?? ""} ${built?.symbol ?? ""} on ${network}.`} />
          ) : built !== null ? (
            <>
              <p className="type-body-sm text-text-secondary">{built.summary}</p>
              <div className="rounded-card border border-border-subtle bg-surface-raised p-3">
                <Eyebrow>To</Eyebrow>
                <p className="type-mono-addr mt-1 break-all text-text-primary">{built.to}</p>
              </div>
              {built.toIsContract && (
                <p className="type-label text-caution">
                  This address is a contract, not a personal wallet. Send only if it is set up to receive {built.symbol} on{" "}
                  {network} — an exchange deposit or a multisig, say.
                </p>
              )}
              {!built.verified && (
                <p className="type-label text-text-muted">
                  {built.symbol} is not on Elyra&rsquo;s verified list. Check the token before sending it.
                </p>
              )}
              <p className="type-label text-text-muted">Network fee: up to {built.networkFeeMax} ETH, paid on {network}.</p>
              <div className="flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" aria-hidden />
                <p className="type-label text-text-secondary">
                  Check the address and the network. A send cannot be reversed, and funds sent on {network} arrive only on{" "}
                  {network}.
                </p>
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
                    className="type-label rounded-chip border border-border-subtle px-2 py-1 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:text-text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Max
                  </button>
                  <select
                    value={selected?.value ?? asset}
                    onChange={(event) => {
                      setAsset(event.target.value);
                      setSendMax(false);
                      setAmount("");
                    }}
                    aria-label="Token to send"
                    className={SELECT}
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="type-label text-text-muted">
                    {selected === null
                      ? feed.loading
                        ? "Reading balances…"
                        : "No balance to send"
                      : `Balance ${formatQty(selected.quantity, 6)} ${selected.label} on ${network}`}
                  </span>
                  {sendMax && (
                    <span className="type-label text-accent">{asset === "native" ? "Less the network fee" : "The whole balance"}</span>
                  )}
                </div>
              </div>
              {selected !== null && !selected.verified && (
                <p className="type-label text-text-muted">Nothing has vouched for this token. Check the contract before sending it.</p>
              )}
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Recipient address</Eyebrow>
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x…"
                  aria-label="Recipient address"
                  spellCheck={false}
                  autoComplete="off"
                  className={FIELD}
                />
                {addressTyped.length > 0 && !isEvmAddress(addressTyped) && (
                  <p className="type-label text-negative">That does not look like an EVM address (0x followed by 40 hex characters).</p>
                )}
              </div>
              <ErrorBox error={error} />
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={built !== null && !finished && busy === null ? () => setBuilt(null) : close}>
            {run?.ok === true ? "Done" : finished ? "Close" : built !== null ? "Back" : "Cancel"}
          </Button>
          {wallet.embedded && !finished &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={confirm}>
                {busy === "sending" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "sending" ? "Sending" : "Confirm send"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={!canReview} onClick={review}>
                {busy === "building" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "building" ? "Checking" : "Review"}
              </Button>
            ))}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Swap
--------------------------------------------------------------------------- */

interface SwapView {
  sellSymbol: string;
  buySymbol: string;
  sellAmount: string;
  buyAmount: string;
  buyAmountMin: string;
  slippagePct: number;
  route: string;
  routeFeeUsd: number | null;
}

interface BuiltSwapStep extends BuiltEvmStep {
  step: "approve" | "swap";
  quote: SwapView;
}

export function EvmSwapDialog({
  chain,
  initialFrom = "ETH",
  initialAmount = "",
  onClose,
}: {
  chain: EvmChainKey;
  initialFrom?: string;
  /** Prefilled, editable — a sale from a holdings row starts at the holding. */
  initialAmount?: string;
  onClose: () => void;
}) {
  const network = EVM_CHAINS[chain].name;
  const wallet = useEvmWallet();
  const feed = usePortfolio();
  const authedFetch = useAuthedFetch();
  const sign = useEvmSigner();
  const tokens = useMemo(() => swapTokens(chain), [chain]);

  const start = tokens.find((token) => token.symbol.toUpperCase() === initialFrom.toUpperCase())?.symbol ?? "ETH";
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(tokens.find((token) => token.symbol !== start && /^USD/.test(token.symbol))?.symbol ?? "ETH");
  const [amount, setAmount] = useState(initialAmount);
  const [built, setBuilt] = useState<BuiltSwapStep | null>(null);
  const [busy, setBusy] = useState<"quoting" | "signing" | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ href: string | null } | null>(null);
  const [run, setRun] = useState<EvmTxRun | null>(null);
  const abort = useRef<AbortController | null>(null);

  const heldOf = (symbol: string): number | null => {
    if (feed.snapshot === null || wallet.address === null) return null;
    const scope = evmScopeId(chain, wallet.address);
    return feed.snapshot.spot
      .filter((holding) => holding.scopeId === scope && holding.symbol.toUpperCase() === symbol.toUpperCase())
      .reduce((sum, holding) => sum + holding.quantity, 0);
  };
  const held = heldOf(from);

  const quote = useCallback(async (): Promise<BuiltSwapStep | null> => {
    const response = await authedFetch("/api/evm/swap/build", {
      method: "POST",
      body: JSON.stringify({ chain, fromSymbol: from, toSymbol: to, amount }),
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<BuiltSwapStep> & { error?: string };
    if (!response.ok || payload.tx === undefined) {
      setError(payload.error ?? "That swap could not be quoted.");
      return null;
    }
    return payload as BuiltSwapStep;
  }, [authedFetch, chain, from, to, amount]);

  const review = useCallback(() => {
    setError(null);
    setBusy("quoting");
    void (async () => {
      try {
        setBuilt(await quote());
      } catch {
        setError("The server could not be reached.");
      } finally {
        setBusy(null);
      }
    })();
  }, [quote]);

  const confirm = useCallback(() => {
    if (built === null) return;
    setError(null);
    setBusy("signing");
    abort.current = new AbortController();
    void (async () => {
      const result = await runEvmTx(authedFetch, sign, built, {
        onBroadcast: (_hash, href) => setPending({ href }),
        signal: abort.current?.signal,
      });
      setPending(null);
      if (!result.ok) {
        setBusy(null);
        if (result.hash === undefined) setError(result.error);
        else setRun(result);
        return;
      }
      if (built.step === "approve") {
        /* Approved. The swap itself is quoted fresh now — the first quote is
           a block or more old by the time the approval lands. */
        setApproved(true);
        setBusy("quoting");
        try {
          setBuilt(await quote());
        } catch {
          setError("The approval landed, but a fresh quote could not be fetched. Review again to continue.");
          setBuilt(null);
        } finally {
          setBusy(null);
        }
        return;
      }
      setBusy(null);
      setRun(result);
      feed.refetch();
    })();
  }, [built, authedFetch, sign, quote, feed]);

  const close = () => {
    abort.current?.abort();
    onClose();
  };

  const finished = run !== null || pending !== null;
  const canReview = wallet.embedded && busy === null && from !== to && amount.trim().length > 0;

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Swap on {network}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">Swap between ETH and listed tokens on {network}.</DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {!wallet.embedded ? (
            <NotSignable chain={chain} />
          ) : finished ? (
            <Outcome
              run={run}
              pending={pending}
              done={`Swapped ${built?.quote.sellAmount ?? ""} ${built?.quote.sellSymbol ?? ""} for ${built?.quote.buySymbol ?? ""} on ${network}.`}
            />
          ) : built !== null ? (
            <>
              {built.step === "approve" ? (
                <>
                  <p className="type-body-sm text-text-primary">Step 1 of 2 — {built.summary}.</p>
                  <p className="type-label text-text-muted">
                    The swap router needs permission to move exactly {built.quote.sellAmount} {built.quote.sellSymbol}. Once that
                    confirms, Elyra fetches a fresh quote for the swap itself, which you sign separately.
                  </p>
                </>
              ) : (
                <>
                  {approved && <p className="type-label text-positive">Approval confirmed. Step 2 of 2 — the swap.</p>}
                  <dl className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-raised p-3">
                    <Row label="You sell" value={`${built.quote.sellAmount} ${built.quote.sellSymbol}`} />
                    <Row label="You receive" value={`≈ ${built.quote.buyAmount} ${built.quote.buySymbol}`} />
                    <Row label="At least" value={`${built.quote.buyAmountMin} ${built.quote.buySymbol} (${built.quote.slippagePct}% slippage)`} />
                    <Row label="Route" value={`${built.quote.route} via LI.FI`} />
                    {built.quote.routeFeeUsd !== null && (
                      <Row label="Route fee" value={`${formatUsd(built.quote.routeFeeUsd)}, taken from the swap`} />
                    )}
                  </dl>
                </>
              )}
              <p className="type-label text-text-muted">Network fee: up to {built.networkFeeMax} ETH, paid on {network}.</p>
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
                  <select value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Token to sell" className={SELECT}>
                    {tokens.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="type-label text-text-muted">
                  {held === null ? "Reading balances…" : `Balance ${formatQty(held, 6)} ${from} on ${network}`}
                </span>
              </div>
              <ArrowDown size={14} className="mx-auto text-text-muted" aria-hidden />
              <div className="flex items-center justify-between gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
                <span className="type-body-sm text-text-secondary">Receive</span>
                <select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Token to buy" className={SELECT}>
                  {tokens.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
              </div>
              {from === to && <p className="type-label text-negative">Choose two different tokens.</p>}
              <p className="type-label text-text-muted">
                Quoted by LI.FI, which charges its own fee; the quote shows it. Robinhood Stock Tokens are not swappable in Elyra
                — they are securities with sale restrictions Elyra cannot check.
              </p>
              <ErrorBox error={error} />
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={built !== null && !finished && busy === null ? () => setBuilt(null) : close}>
            {run?.ok === true ? "Done" : finished ? "Close" : built !== null ? "Back" : "Cancel"}
          </Button>
          {wallet.embedded && !finished &&
            (built !== null ? (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={confirm}>
                {busy !== null && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "quoting" ? "Quoting" : busy === "signing" ? "Signing" : built.step === "approve" ? "Approve" : "Confirm swap"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={!canReview} onClick={review}>
                {busy === "quoting" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {busy === "quoting" ? "Quoting" : "Review"}
              </Button>
            ))}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-label shrink-0 text-text-muted">{label}</dt>
      <dd className="type-data-sm min-w-0 text-right tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}
