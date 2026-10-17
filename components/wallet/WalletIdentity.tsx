"use client";

import { useState } from "react";
import { AlertTriangle, AtSign, ExternalLink, KeyRound, Mail, Phone, QrCode, Wallet, type LucideIcon } from "lucide-react";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton, IconButton } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signInLabel } from "@/lib/account";
import { truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Who this wallet is, and which ledger it is on.

   The network is the cluster the node reported via its genesis hash, not a
   label read off config. When that is not mainnet the line becomes a
   warning, because a devnet balance shown as real money is the worst thing
   this drawer could do — and a Solana key is valid on every cluster, so the
   fix is the endpoint, which the copy says.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

const METHOD_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

const ICON_LINK = cn(
  "grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
);

export function WalletIdentity({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const logos = useTickerLogos(SOL);
  const [receiving, setReceiving] = useState(false);

  const method = auth.account?.loginMethod ?? null;
  const badge = signInLabel(method);
  const MethodIcon = method === null ? null : (METHOD_ICON[method.type] ?? AtSign);
  const address = wallet.address;

  return (
    <section aria-label="Wallet identity" className="px-5 pb-4 pt-4">
      <div className="flex items-center gap-3">
        <CoinMark symbol="SOL" {...logos("SOL")} size={32} className="border-0 bg-transparent" />
        <span className={cn("type-body-sm min-w-0 flex-1 truncate", wallet.wrongChain ? "text-negative" : "text-text-secondary")}>
          {wallet.chain}
        </span>
        {badge !== null && MethodIcon !== null && (
          <span className="type-label inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-border-subtle px-2.5 text-text-secondary">
            <MethodIcon size={14} strokeWidth={1.5} aria-hidden />
            {badge}
          </span>
        )}
      </div>

      {address === null ? (
        <p className="type-body-sm mt-3 text-text-secondary">
          {wallet.isLoading ? "Reading this account…" : "This account has no Solana wallet yet."}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-0.5">
          {/* The full address is here for assistive tech and on hover; the
              copy button copies all of it. */}
          <span className="type-mono-addr mr-1.5 text-text-primary" title={address}>
            {truncateMiddle(address, 4, 4)}
            <span className="sr-only"> (full address: {address})</span>
          </span>
          <CopyButton value={address} label="wallet address" />
          <IconButton label="Show QR code to receive" onClick={() => setReceiving(true)}>
            <QrCode size={15} strokeWidth={1.5} aria-hidden />
          </IconButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={accountExplorerUrl(address, wallet.cluster)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on Solscan (opens in a new tab)"
                className={ICON_LINK}
              >
                <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
              </a>
            </TooltipTrigger>
            <TooltipContent>View on Solscan</TooltipContent>
          </Tooltip>
        </div>
      )}

      {wallet.wrongChain && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-control border border-negative/40 bg-negative-bg px-3 py-2">
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-negative" />
          <p className="type-label text-text-secondary">
            These are {CLUSTER_LABEL[wallet.cluster ?? "unknown"]} balances, not {CLUSTER_LABEL[EXPECTED_CLUSTER]} ones.
            A Solana key is valid on every cluster, so the endpoint decides which ledger is read — point
            SOLANA_RPC_URL at mainnet.
          </p>
        </div>
      )}

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={address} cluster={wallet.cluster} />
    </section>
  );
}
