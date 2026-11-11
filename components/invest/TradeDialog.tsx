"use client";

import { useCallback, useRef, useState } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { AlertTriangle, Check, Circle, ExternalLink, Loader2, Minus, X } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatUsd } from "@/lib/format";
import { ELIGIBILITY_NOTE } from "@/lib/invest/catalog";
import type { Leg } from "@/lib/invest/plan";
import type { FillResponse, PricedPortfolio } from "@/lib/invest/types";
import { useInvest } from "@/lib/invest/useInvest";
import { txExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { runSwap } from "@/lib/wallet/runSwap";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Buying or rebalancing a portfolio: a reviewed list of swaps, run one after
   another, each signed in the person's wallet.

   Every leg is lib/wallet/runSwap.ts — the same quote, signature and submit
   as a single swap. Nothing is batched behind one signature: the person sees
   each swap's own numbers in their wallet before it is signed.

   Sales run first, so a rebalance's buys are paid with what they raised. A
   leg the market refuses (an Ondo token outside its trading window) is
   marked and the rest still run — the portfolio's page then shows what is
   missing, and "Retry" runs just those. A cancelled signature stops
   everything after it: closing the wallet's prompt is a decision about the
   whole purchase, not one swap.

   Each landed swap is recorded against the portfolio by its signature
   (/api/invest/fills), which reads the real balance change from the chain.
--------------------------------------------------------------------------- */

type Status = "waiting" | "quoting" | "signing" | "landed" | "recorded" | "failed" | "skipped";

interface Row {
  leg: Leg;
  status: Status;
  detail: string | null;
  signature: string | null;
}

function describe(leg: Leg): string {
  return leg.side === "buy" ? `Buy ${leg.ticker} with ${leg.amount} USDC` : `Sell ${leg.amount} ${leg.ticker} for USDC`;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "quoting" || status === "signing") return <Loader2 size={14} className="animate-spin text-text-secondary" aria-hidden />;
  if (status === "recorded" || status === "landed") return <Check size={14} className="text-positive" aria-hidden />;
  if (status === "failed") return <X size={14} className="text-negative" aria-hidden />;
  if (status === "skipped") return <Minus size={14} className="text-text-muted" aria-hidden />;
  return <Circle size={10} className="text-text-muted" aria-hidden />;
}

const STATUS_WORDS: Record<Status, string> = {
  waiting: "Waiting",
  quoting: "Quoting",
  signing: "Waiting for your signature",
  landed: "Landed",
  recorded: "Landed and recorded",
  failed: "Did not go through",
  skipped: "Not started",
};

export function TradeDialog({
  portfolio,
  kind,
  legs,
  newHoldings,
  onClose,
}: {
  portfolio: PricedPortfolio;
  kind: "buy" | "rebalance";
  /** Sales first. The dialog runs them in the order given. */
  legs: Leg[];
  /** Holdings this wallet has none of, each of which opens a token account. */
  newHoldings: number;
  onClose: () => void;
}) {
  const auth = useElyraAuth();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const authedFetch = useAuthedFetch();
  const { record } = useInvest();

  const [rows, setRows] = useState<Row[]>(() =>
    legs.map((leg) => ({ leg, status: "waiting", detail: null, signature: null })),
  );
  const [phase, setPhase] = useState<"review" | "running" | "done">("review");
  const [error, setError] = useState<string | null>(null);
  const stopping = useRef(false);

  const update = useCallback((index: number, next: Partial<Row>) => {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...next } : row)));
  }, []);

  const run = useCallback(
    async (indices: number[]) => {
      setError(null);
      const wallet = wallets.find((entry) => entry.address === auth.solanaAddress) ?? wallets[0];
      if (wallet === undefined) {
        setError("No Solana wallet is connected in this browser.");
        return;
      }

      stopping.current = false;
      setPhase("running");
      const sign = async (transaction: Uint8Array) =>
        (await signTransaction({ transaction, wallet })).signedTransaction;
      const recordings: Promise<void>[] = [];

      for (let position = 0; position < indices.length; position += 1) {
        const index = indices[position];
        if (stopping.current) {
          for (const rest of indices.slice(position)) update(rest, { status: "skipped", detail: "Stopped before this swap." });
          break;
        }

        const leg = legs[index];
        update(index, { status: "quoting", detail: null });
        const result = await runSwap(
          authedFetch,
          sign,
          leg.side === "buy"
            ? { fromSymbol: "USDC", toSymbol: leg.symbol, amount: leg.amount }
            : { fromSymbol: leg.symbol, toSymbol: "USDC", amount: leg.amount },
          () => update(index, { status: "signing" }),
        );

        if (!result.ok) {
          update(index, { status: "failed", detail: result.error });
          if (result.cancelled) {
            for (const rest of indices.slice(position + 1)) {
              update(rest, { status: "skipped", detail: "Not started — the signature before it was cancelled." });
            }
            break;
          }
          continue;
        }

        update(index, { status: "landed", detail: "Recording…", signature: result.signature });
        /* Recorded alongside the next leg rather than before it: an RFQ quote
           is good for seconds, and waiting on the ledger would spend them. */
        recordings.push(
          record(portfolio.id, result.signature).then((fill: FillResponse) => {
            if (fill.outcome === "recorded" || fill.outcome === "already-recorded") {
              update(index, { status: "recorded", detail: null });
            } else {
              update(index, {
                status: "landed",
                detail:
                  fill.outcome === "pending"
                    ? "Landed, but the network has not shown it yet, so it is not counted in this portfolio. Record it again in a minute."
                    : `Landed, but not counted in this portfolio: ${fill.reason ?? "the ledger refused it."}`,
              });
            }
          }),
        );
      }

      await Promise.all(recordings);
      setPhase("done");
    },
    [wallets, auth.solanaAddress, signTransaction, authedFetch, legs, portfolio.id, record, update],
  );

  const recordAgain = useCallback(
    async (index: number) => {
      const signature = rows[index]?.signature;
      if (signature === null || signature === undefined) return;
      update(index, { detail: "Recording…" });
      const fill = await record(portfolio.id, signature);
      update(
        index,
        fill.outcome === "recorded" || fill.outcome === "already-recorded"
          ? { status: "recorded", detail: null }
          : { detail: fill.reason ?? "Still not recorded." },
      );
    },
    [rows, record, portfolio.id, update],
  );

  const failed = rows.flatMap((row, index) => (row.status === "failed" || row.status === "skipped" ? [index] : []));
  const landed = rows.filter((row) => row.status === "landed" || row.status === "recorded").length;
  const sells = legs.filter((leg) => leg.side === "sell");
  const buys = legs.filter((leg) => leg.side === "buy");
  const spend = buys.reduce((sum, leg) => sum + leg.usd, 0);
  const raise = sells.reduce((sum, leg) => sum + leg.usd, 0);

  const title = kind === "buy" ? `Buy ${portfolio.name}` : `Rebalance ${portfolio.name}`;

  const notes = [
    `${legs.length} ${legs.length === 1 ? "swap" : "swaps"}, each signed in your wallet, run one after another. If one is refused — an Ondo token outside its trading hours — the rest still run, and you can retry it.`,
  ];
  if (sells.length > 0) {
    notes.push("Sales run first, so the buys are paid with the USDC they raise. Buys spend 99% of the expected proceeds, so a little USDC may be left.");
  }
  if (newHoldings > 0) {
    notes.push(
      `${newHoldings} ${newHoldings === 1 ? "holding is" : "holdings are"} new to this wallet. Each opens a token account that holds about 0.002 SOL, returned if the account is closed — keep some SOL for that and for network fees.`,
    );
  }
  notes.push(ELIGIBILITY_NOTE);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        /* Closing mid-run would orphan a signature prompt; stop after the
           current swap instead. */
        if (!next && phase !== "running") onClose();
      }}
    >
      <DialogContent side="center" surface="panel" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>{kind === "buy" ? "Buy portfolio" : "Rebalance"}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {title}: a list of swaps, each routed by Jupiter and signed in your wallet.
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-col gap-0.5">
            <p className="type-h2 text-text-primary">{title}</p>
            <p className="type-body-sm text-text-secondary">
              {sells.length > 0 && <>Sells about {formatUsd(raise)} · </>}
              {buys.length > 0 ? <>Spends {formatUsd(spend)} USDC</> : <>No buys</>}
            </p>
          </div>

          <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-raised">
            {rows.map((row, index) => (
              <li key={`${row.leg.side}-${row.leg.symbol}`} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-4 shrink-0 place-items-center">
                    <StatusIcon status={row.status} />
                  </span>
                  <span className="type-data-sm min-w-0 flex-1 truncate text-text-primary">{describe(row.leg)}</span>
                  <span className="type-data-sm shrink-0 text-text-secondary">≈ {formatUsd(row.leg.usd)}</span>
                </div>
                {row.status !== "waiting" && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                    <span
                      className={cn(
                        "type-label",
                        row.status === "failed" ? "text-negative" : row.status === "recorded" ? "text-positive" : "text-text-muted",
                      )}
                    >
                      {STATUS_WORDS[row.status]}
                    </span>
                    {row.signature !== null && (
                      <a
                        href={txExplorerUrl(row.signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="type-label inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                      >
                        <ExternalLink size={11} aria-hidden />
                        Explorer
                      </a>
                    )}
                    {phase === "done" && row.status === "landed" && row.signature !== null && (
                      <button
                        type="button"
                        onClick={() => void recordAgain(index)}
                        className="type-label text-text-primary underline underline-offset-2"
                      >
                        Record again
                      </button>
                    )}
                  </div>
                )}
                {row.detail !== null && <p className="type-label pl-6 text-text-secondary">{row.detail}</p>}
              </li>
            ))}
          </ol>

          {phase === "review" && (
            <ul className="flex flex-col gap-2">
              {notes.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
                  <p className="type-label text-text-secondary">{line}</p>
                </li>
              ))}
            </ul>
          )}

          {phase === "done" && (
            <p role="status" className="type-body-sm text-text-primary">
              {landed} of {legs.length} {legs.length === 1 ? "swap" : "swaps"} landed.
              {failed.length > 0 && " The rest can be retried — prices are quoted fresh each time."}
            </p>
          )}

          {error !== null && (
            <div role="alert" className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
              <p className="type-label text-negative">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          {phase === "running" ? (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                stopping.current = true;
              }}
            >
              Stop after this swap
            </Button>
          ) : (
            <Button size="sm" variant="quiet" onClick={onClose}>
              {phase === "done" ? "Done" : "Cancel"}
            </Button>
          )}

          {phase === "review" && (
            <Button size="sm" variant="accent" onClick={() => void run(legs.map((_, index) => index))}>
              {kind === "buy" ? "Start purchase" : "Start rebalance"}
            </Button>
          )}
          {phase === "done" && failed.length > 0 && (
            <Button size="sm" variant="accent" onClick={() => void run(failed)}>
              Retry {failed.length} {failed.length === 1 ? "swap" : "swaps"}
            </Button>
          )}
          {phase === "running" && (
            <span className="type-label inline-flex items-center gap-1.5 text-text-secondary">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Working
            </span>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
