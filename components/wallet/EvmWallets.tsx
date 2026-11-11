"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ExternalLink, QrCode, Send } from "lucide-react";
import { Money } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton, IconButton } from "@/components/shell/RouteDrawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EvmSendDialog, EvmSwapDialog, useEvmWallet } from "@/components/wallet/EvmDialogs";
import { NetworkMark } from "@/components/wallet/NetworkMark";
import { AssetRow } from "@/components/wallet/WalletBalances";
import { EVM_CHAIN_KEYS, EVM_CHAINS, evmAddressUrl, evmScopeId, type EvmChainKey } from "@/lib/evm/chains";
import { formatPrice, truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import type { PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import type { Cluster } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The account's EVM wallet, on Ethereum and on Robinhood Chain.

   One address and two ledgers, so one address row and then each network's
   balances under its own name — the same ETH can sit on both, and a person
   reading "ETH 0.4" needs to know which network it is on before they send
   it anywhere.

   Read from the portfolio store, which already reads both chains
   (lib/evm/wallet.ts) — this section subscribes rather than fetching for
   itself, and only while the drawer is open. Its rules are the drawer's: a
   loading figure is a skeleton, a failed read says why, and only a network
   that was read and holds nothing says so.

   Sending and swapping open from each network's row, signed by Elyra's
   embedded EVM wallet (components/wallet/EvmDialogs.tsx); a linked external
   wallet is read here and used from its own app.
--------------------------------------------------------------------------- */

const ICON_LINK = cn(
  "grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
);

function byValue(a: SpotHolding, b: SpotHolding): number {
  return (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
}

/** "Apple • Robinhood Token · 1.0011 shares per token", when a corporate action has moved it. */
function nameOf(holding: SpotHolding): string {
  const name = holding.name ?? holding.symbol;
  const multiplier = holding.stockToken?.multiplier;
  if (multiplier === undefined || Math.abs(multiplier - 1) < 1e-6) return name;
  return `${name} · ${formatPrice(multiplier, 4)} shares per token`;
}

function reasonFor(holding: SpotHolding): string {
  if (holding.stockToken !== undefined) {
    return `No US equity price for ${holding.stockToken.ticker} from Pyth, so this token is not counted.`;
  }
  return "No price for this token from Pyth right now.";
}

function ChainBalances({
  chain,
  snapshot,
  address,
  onAction,
}: {
  chain: EvmChainKey;
  snapshot: PortfolioSnapshot;
  address: string;
  /** Null when this browser cannot sign for the EVM wallet. */
  onAction: ((action: "send" | "swap", chain: EvmChainKey) => void) | null;
}) {
  const meta = EVM_CHAINS[chain];
  const scopeId = evmScopeId(chain, address);
  const scope = snapshot.scopes.find((entry) => entry.id === scopeId) ?? null;
  const failure = snapshot.notes.find((note) => note.kind === "failed" && note.scope === meta.name.toLowerCase());
  const holdings = useMemo(
    () => snapshot.spot.filter((holding) => holding.scopeId === scopeId).sort(byValue),
    [snapshot.spot, scopeId],
  );
  const symbols = useMemo(() => holdings.map((holding) => holding.symbol), [holdings]);
  const logos = useTickerLogos(symbols);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <NetworkMark network={chain} size={20} />
        <h4 className="type-body min-w-0 flex-1 truncate font-medium text-text-primary">{meta.name}</h4>
        <Money
          value={scope?.valueUsd ?? null}
          reason={failure?.reason ?? `${meta.name} could not be read.`}
          className="type-body-sm text-text-secondary"
        />
        {onAction !== null && (
          <>
            <IconButton label={`Send on ${meta.name}`} onClick={() => onAction("send", chain)}>
              <Send size={14} strokeWidth={1.5} aria-hidden />
            </IconButton>
            <IconButton label={`Swap on ${meta.name}`} onClick={() => onAction("swap", chain)}>
              <ArrowLeftRight size={15} strokeWidth={1.5} aria-hidden />
            </IconButton>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={evmAddressUrl(chain, address)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View on ${meta.explorer.name} (opens in a new tab)`}
              className={ICON_LINK}
            >
              <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
            </a>
          </TooltipTrigger>
          <TooltipContent>View on {meta.explorer.name}</TooltipContent>
        </Tooltip>
      </div>

      {scope === null ? (
        <p role="status" className="type-label mt-1 text-negative">
          {failure?.reason ?? `${meta.name} could not be read.`}
        </p>
      ) : holdings.length === 0 ? (
        <p className="type-body-sm mt-1 text-text-secondary">No balances on {meta.name} yet.</p>
      ) : (
        <ul className="mt-0.5 list-none">
          {holdings.map((holding) => (
            <AssetRow
              key={holding.id}
              symbol={holding.symbol}
              name={nameOf(holding)}
              /* A stock token wears only its own registry logo: its ticker
                 can name an unrelated coin, whose icon would be a lie. */
              logo={
                holding.stockToken !== undefined || !holding.verified
                  ? { logo: holding.logo }
                  : { logo: holding.logo ?? logos(holding.symbol).logo, fallbackLogo: logos(holding.symbol).fallbackLogo }
              }
              amount={holding.quantity}
              usd={holding.verified ? holding.valueUsd : null}
              reason={holding.verified ? reasonFor(holding) : "Unverified tokens are never valued."}
              unverified={!holding.verified}
            />
          ))}
        </ul>
      )}
      {scope !== null && failure !== undefined && (
        <p className="type-label mt-1 text-caution">{failure.reason}</p>
      )}
    </div>
  );
}

export function EvmWallets({ cluster }: { cluster: Cluster | null }) {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const [receiving, setReceiving] = useState(false);
  const [acting, setActing] = useState<{ action: "send" | "swap"; chain: EvmChainKey } | null>(null);
  const { address, embedded } = useEvmWallet();

  /* An account with no EVM wallet has nothing to show here, and says so
     nowhere: Privy creates one for every email sign-in, so its absence is a
     wallet-only Solana login, not a fault. */
  if (address === null) return null;

  const snapshot = feed.snapshot;

  return (
    <section aria-labelledby="evm-wallets-heading" className="mx-5 border-t border-border-subtle py-4">
      <h3 id="evm-wallets-heading" className="type-h2 font-sans text-text-secondary">
        Ethereum and Robinhood Chain
      </h3>

      <div className="mt-2 flex items-center gap-0.5">
        <span className="type-mono-addr mr-1.5 text-text-primary" title={address}>
          {truncateMiddle(address, 6, 4)}
          <span className="sr-only"> (full address: {address})</span>
        </span>
        <CopyButton value={address} label="EVM wallet address" />
        <IconButton label="Show QR code to receive on Ethereum or Robinhood Chain" onClick={() => setReceiving(true)}>
          <QrCode size={15} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>
      <p className="type-label text-text-muted">The same address on both networks; each keeps its own balance.</p>

      {snapshot === null ? (
        feed.loading ? (
          <div aria-busy="true" aria-label="Reading Ethereum and Robinhood Chain" className="mt-3 flex flex-col gap-3">
            {EVM_CHAIN_KEYS.map((key) => (
              <div key={key} aria-hidden className="flex items-center gap-3">
                <span className="skeleton size-5 rounded-pill" />
                <span className="skeleton h-3.5 w-28" />
                <span className="skeleton ml-auto h-3.5 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <p role="status" className="type-label mt-3 text-negative">
            {feed.error ?? "These balances couldn't be read."}{" "}
            <button
              type="button"
              onClick={feed.refetch}
              disabled={feed.refreshing}
              className="relative font-medium text-text-primary underline decoration-border-strong underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2 hover:decoration-accent disabled:text-text-muted disabled:no-underline"
            >
              {feed.refreshing ? "Trying…" : "Try again"}
            </button>
          </p>
        )
      ) : (
        <>
          {feed.stale && (
            <p className="type-label mt-2 text-caution">The latest refresh failed; these are the last good balances.</p>
          )}
          {EVM_CHAIN_KEYS.map((key) => (
            <ChainBalances
              key={key}
              chain={key}
              snapshot={snapshot}
              address={address}
              onAction={embedded && auth.available ? (action, chain) => setActing({ action, chain }) : null}
            />
          ))}
        </>
      )}

      {!embedded && (
        <p className="type-label mt-3 text-text-muted">
          This EVM wallet is a linked external wallet, so sending and swapping happen in that wallet&rsquo;s own app.
        </p>
      )}

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={auth.solanaAddress} cluster={cluster} network="ethereum" />
      {acting?.action === "send" && <EvmSendDialog chain={acting.chain} onClose={() => setActing(null)} />}
      {acting?.action === "swap" && <EvmSwapDialog chain={acting.chain} onClose={() => setActing(null)} />}
    </section>
  );
}
