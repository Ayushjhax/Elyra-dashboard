"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ExternalLink, Loader2, QrCode, Send } from "lucide-react";
import { Money } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton, IconButton } from "@/components/shell/RouteDrawer";
import { NetworkMark } from "@/components/wallet/NetworkMark";
import { SuiSendDialog, SuiSwapDialog } from "@/components/wallet/SuiDialogs";
import { AssetRow } from "@/components/wallet/WalletBalances";
import { truncateMiddle } from "@/lib/format";
import type { SpotHolding } from "@/lib/portfolio/types";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { isSuiAddress, suiAddressUrl, suiScopeId } from "@/lib/sui/chain";
import type { Cluster } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The account's Sui wallet, in the wallet drawer.

   Its own key — a Privy embedded wallet on Sui, created for the account at
   sign-in (PrivyClientProvider) — so its own address, its own balances and
   its own Send and Swap. Read from the portfolio store like every other
   chain; a coin on no trusted list is shown, flagged and never counted.
--------------------------------------------------------------------------- */

const ICON_LINK = cn(
  "grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
);

function byValue(a: SpotHolding, b: SpotHolding): number {
  if (a.verified !== b.verified) return a.verified ? -1 : 1;
  return (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
}

export function SuiWallet({ cluster }: { cluster: Cluster | null }) {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const [receiving, setReceiving] = useState(false);
  const [acting, setActing] = useState<"send" | "swap" | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const address = isSuiAddress(auth.suiAddress) ? auth.suiAddress : null;
  const snapshot = feed.snapshot;

  const holdings = useMemo(() => {
    if (snapshot === null || address === null) return [];
    const scope = suiScopeId(address);
    return snapshot.spot.filter((holding) => holding.scopeId === scope).sort(byValue);
  }, [snapshot, address]);
  const scope = address === null || snapshot === null ? null : (snapshot.scopes.find((entry) => entry.id === suiScopeId(address)) ?? null);
  const failure = snapshot?.notes.find((note) => note.kind === "failed" && note.scope === "sui");

  if (!auth.available || !auth.authenticated) return null;

  return (
    <section aria-labelledby="sui-wallet-heading" className="mx-5 border-t border-border-subtle py-4">
      <div className="flex items-center gap-2">
        <NetworkMark network="sui" size={20} />
        <h3 id="sui-wallet-heading" className="type-h2 min-w-0 flex-1 font-sans text-text-secondary">
          Sui
        </h3>
        {address !== null && (
          <>
            <Money value={scope?.valueUsd ?? null} reason={failure?.reason ?? "Sui could not be read."} className="type-body-sm text-text-secondary" />
            <IconButton label="Send on Sui" onClick={() => setActing("send")}>
              <Send size={14} strokeWidth={1.5} aria-hidden />
            </IconButton>
            <IconButton label="Swap on Sui" onClick={() => setActing("swap")}>
              <ArrowLeftRight size={15} strokeWidth={1.5} aria-hidden />
            </IconButton>
            <a href={suiAddressUrl(address)} target="_blank" rel="noopener noreferrer" aria-label="View on Suiscan (opens in a new tab)" className={ICON_LINK}>
              <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
            </a>
          </>
        )}
      </div>

      {address === null ? (
        <div className="mt-2 flex flex-col items-start gap-2">
          <p className="type-body-sm text-text-secondary">This account has no Sui wallet yet.</p>
          <button
            type="button"
            disabled={creating}
            onClick={() => {
              setCreating(true);
              setCreateError(null);
              auth
                .createSuiWallet()
                .catch((error: unknown) => setCreateError(error instanceof Error ? error.message : "The Sui wallet could not be created."))
                .finally(() => setCreating(false));
            }}
            className="type-body-sm inline-flex h-9 items-center gap-2 rounded-control border border-accent-quiet px-3 text-text-primary hover:border-accent hover:bg-surface-hover disabled:opacity-60"
          >
            {creating && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {creating ? "Creating" : "Set up a Sui wallet"}
          </button>
          {createError !== null && <p className="type-label text-negative">{createError}</p>}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-0.5">
            <span className="type-mono-addr mr-1.5 text-text-primary" title={address}>
              {truncateMiddle(address, 6, 4)}
              <span className="sr-only"> (full address: {address})</span>
            </span>
            <CopyButton value={address} label="Sui wallet address" />
            <IconButton label="Show QR code to receive on Sui" onClick={() => setReceiving(true)}>
              <QrCode size={15} strokeWidth={1.5} aria-hidden />
            </IconButton>
          </div>
          {snapshot === null ? (
            feed.loading ? (
              <div aria-busy="true" aria-label="Reading Sui" className="mt-3 flex items-center gap-3">
                <span className="skeleton size-5 rounded-pill" />
                <span className="skeleton h-3.5 w-28" />
              </div>
            ) : null
          ) : scope === null ? (
            <p role="status" className="type-label mt-2 text-negative">{failure?.reason ?? "Sui could not be read."}</p>
          ) : holdings.length === 0 ? (
            <p className="type-body-sm mt-2 text-text-secondary">No balances on Sui yet.</p>
          ) : (
            <ul className="mt-1 list-none">
              {holdings.map((holding) => (
                <AssetRow
                  key={holding.id}
                  symbol={holding.symbol}
                  /* An unverified coin is named by its type, never the name it claims. */
                  name={holding.verified ? (holding.name ?? holding.symbol) : (holding.address ?? holding.symbol)}
                  logo={{ logo: holding.logo }}
                  amount={holding.quantity}
                  usd={holding.verified ? holding.valueUsd : null}
                  reason={holding.verified ? "No price for this coin from Pyth right now." : "Unverified coins are never valued."}
                  unverified={!holding.verified}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={auth.solanaAddress} cluster={cluster} network="sui" />
      {acting === "send" && <SuiSendDialog onClose={() => setActing(null)} />}
      {acting === "swap" && <SuiSwapDialog onClose={() => setActing(null)} />}
    </section>
  );
}
