"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { QrCode } from "@/components/ui/QrCode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Where to send funds.

   One destination, named outright: the account's Solana wallet, on the
   cluster the node reported — not the one the config assumes. An account
   may also hold an Ethereum wallet (Hyperliquid is keyed by it), so the
   dialog says which wallet and which network in words, beside the code,
   rather than leaving the person to infer it from an address's shape.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

export function ReceiveDialog({
  open,
  onOpenChange,
  address,
  cluster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string | null;
  /** What the node reported. Null before the first read — then the expected one, labelled as such. */
  cluster: Cluster | null;
}) {
  const auth = useElyraAuth();
  const logos = useTickerLogos(SOL);
  const network = CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER];
  const offMainnet = cluster !== null && cluster !== EXPECTED_CLUSTER;
  const embedded = auth.account?.solanaIsEmbedded === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(400px,calc(100vw-24px))] p-0">
        <DialogHeader className="border-b border-border-subtle px-4 py-3">
          <DialogTitle className="type-h2 text-text-primary">Receive</DialogTitle>
          <DialogDescription className="type-body-sm text-text-secondary">
            Send SOL or Solana tokens to this address.
          </DialogDescription>
        </DialogHeader>

        {address === null ? (
          <p className="type-body-sm px-4 py-6 text-text-secondary">
            This account has no Solana wallet to receive into. Link one from your account to get an address.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4">
            <div className="flex w-full items-center gap-2.5 rounded-control border border-border-subtle bg-surface-raised px-3 py-2">
              <CoinMark symbol="SOL" {...logos("SOL")} size={24} />
              <div className="min-w-0 flex-1">
                <p className="type-body-sm font-medium text-text-primary">{network}</p>
                <p className="type-label text-text-secondary">
                  {embedded ? "Your Elyra wallet" : "Your linked Solana wallet"}
                </p>
              </div>
            </div>

            <QrCode value={address} label="QR code of the wallet address" />

            <div className="flex w-full flex-col gap-2">
              {/* Selectable as well as copyable, whole: a receiving address is
                  never shown truncated. */}
              <p className="type-mono-addr w-full select-all break-all rounded-control border border-border-subtle bg-surface-base px-3 py-2.5 text-center text-text-primary">
                {address}
              </p>
              <CopyButton value={address} label="wallet address" text="Copy address" className="w-full" />
            </div>

            <p
              className={cn(
                "type-label flex w-full items-start gap-2",
                offMainnet ? "text-negative" : "text-text-secondary",
              )}
            >
              <TriangleAlert size={14} strokeWidth={1.5} aria-hidden className="mt-px shrink-0 text-caution" />
              {offMainnet
                ? `This wallet is being read on ${network}. Funds sent on mainnet will not show here until the RPC points at mainnet.`
                : `Only send assets on ${network}. Tokens sent from another network, such as Ethereum, can be lost.`}
            </p>

            <a
              href={accountExplorerUrl(address, cluster)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "type-label inline-flex items-center gap-1.5 self-start rounded-chip text-text-secondary",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
              )}
            >
              View on Solscan
              <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
