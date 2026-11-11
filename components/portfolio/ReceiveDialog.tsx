"use client";

import { useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton } from "@/components/shell/RouteDrawer";
import { QrCode } from "@/components/ui/QrCode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NETWORK_NAME, NetworkMark, type Network } from "@/components/wallet/NetworkMark";
import { EVM_CHAINS, evmAddressUrl, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Where to send funds.

   One network at a time, named outright. The account holds two wallets — a
   Solana one, and an EVM one whose single address is valid on both Ethereum
   and Robinhood Chain — so the dialog asks which network first and then says
   which wallet and which network in words, beside the code, rather than
   leaving the person to infer it from an address's shape.

   The two EVM tabs show the same address on purpose, and say why: the key is
   the same, the ledgers are not. ETH sent on Ethereum lands on Ethereum and
   is not visible on Robinhood Chain, which is the mistake the warning
   under each code exists to prevent.

   Solana is read on the cluster the node reported — not the one the config
   assumes — and a non-mainnet cluster turns its warning red.
--------------------------------------------------------------------------- */

export function ReceiveDialog({
  open,
  onOpenChange,
  address,
  cluster,
  network: initial = "solana",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Solana wallet. */
  address: string | null;
  /** What the node reported. Null before the first read — then the expected one, labelled as such. */
  cluster: Cluster | null;
  /** The network the dialog opens on. */
  network?: Network;
}) {
  const auth = useElyraAuth();
  const evmAddress = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  const [chosen, setChosen] = useState<Network>(initial);
  /* Reopened from a different entry point, the dialog starts where that
     entry point asked rather than where it was last left. */
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) setChosen(initial);
  }
  const network: Network = evmAddress === null ? "solana" : chosen;

  const accounts = auth.account?.accounts ?? [];
  const evmEmbedded = accounts.some(
    (entry) =>
      entry.type === "wallet" &&
      entry.chainType === "ethereum" &&
      entry.walletClientType === "privy" &&
      entry.detail?.toLowerCase() === evmAddress?.toLowerCase(),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(400px,calc(100vw-24px))] p-0">
        <DialogHeader className="border-b border-border-subtle px-4 py-3">
          <DialogTitle className="type-h2 text-text-primary">Receive</DialogTitle>
          <DialogDescription className="type-body-sm text-text-secondary">
            {network === "solana"
              ? "Send SOL or Solana tokens to this address."
              : `Send ETH or tokens on ${NETWORK_NAME[network]} to this address.`}
          </DialogDescription>
        </DialogHeader>

        {/* The dialog is capped in height; the body scrolls under the header
            and the network tabs rather than clipping the explorer link off
            a short screen. */}
        {evmAddress === null ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SolanaReceive address={address} cluster={cluster} embedded={auth.account?.solanaIsEmbedded === true} />
          </div>
        ) : (
          <Tabs value={network} onValueChange={(value) => setChosen(value as Network)} className="min-h-0 flex-1">
            <TabsList aria-label="Network" className="shrink-0 border-b border-border-subtle px-2">
              {(["solana", "ethereum", "robinhood"] as const).map((key) => (
                <TabsTrigger key={key} value={key} className="h-11 gap-1.5">
                  <NetworkMark network={key} size={16} />
                  {key === "robinhood" ? (
                    <>
                      <span className="hidden min-[400px]:inline">{NETWORK_NAME.robinhood}</span>
                      <span className="min-[400px]:hidden">{EVM_CHAINS.robinhood.shortName}</span>
                    </>
                  ) : (
                    NETWORK_NAME[key]
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="solana" className="overflow-y-auto overscroll-contain">
              <SolanaReceive address={address} cluster={cluster} embedded={auth.account?.solanaIsEmbedded === true} />
            </TabsContent>
            {(["ethereum", "robinhood"] as const).map((key) => (
              <TabsContent key={key} value={key} className="overflow-y-auto overscroll-contain">
                <EvmReceive chain={key} address={evmAddress} embedded={evmEmbedded} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The code, the whole address and the copy — the same for every network. */
function AddressBlock({ address }: { address: string }) {
  return (
    <>
      <QrCode value={address} label="QR code of the wallet address" />
      <div className="flex w-full flex-col gap-2">
        {/* Selectable as well as copyable, whole: a receiving address is
            never shown truncated. */}
        <p className="type-mono-addr w-full select-all break-all rounded-control border border-border-subtle bg-surface-base px-3 py-2.5 text-center text-text-primary">
          {address}
        </p>
        <CopyButton value={address} label="wallet address" text="Copy address" className="w-full" />
      </div>
    </>
  );
}

function NetworkCard({ network, label, detail }: { network: Network; label: string; detail: string }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-control border border-border-subtle bg-surface-raised px-3 py-2">
      <NetworkMark network={network} size={24} />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm font-medium text-text-primary">{label}</p>
        <p className="type-label text-text-secondary">{detail}</p>
      </div>
    </div>
  );
}

function Warning({ children, severe = false }: { children: React.ReactNode; severe?: boolean }) {
  return (
    <p className={cn("type-label flex w-full items-start gap-2", severe ? "text-negative" : "text-text-secondary")}>
      <TriangleAlert size={14} strokeWidth={1.5} aria-hidden className="mt-px shrink-0 text-caution" />
      <span>{children}</span>
    </p>
  );
}

function ExplorerLink({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "type-label inline-flex items-center gap-1.5 self-start rounded-chip text-text-secondary",
        "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
      )}
    >
      View on {name}
      <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
    </a>
  );
}

function SolanaReceive({
  address,
  cluster,
  embedded,
}: {
  address: string | null;
  cluster: Cluster | null;
  embedded: boolean;
}) {
  const network = CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER];
  const offMainnet = cluster !== null && cluster !== EXPECTED_CLUSTER;

  if (address === null) {
    return (
      <p className="type-body-sm px-4 py-6 text-text-secondary">
        This account has no Solana wallet to receive into. Link one from your account to get an address.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4">
      <NetworkCard network="solana" label={network} detail={embedded ? "Your Elyra wallet" : "Your linked Solana wallet"} />
      <AddressBlock address={address} />
      <Warning severe={offMainnet}>
        {offMainnet
          ? `This wallet is being read on ${network}. Funds sent on mainnet will not show here until the RPC points at mainnet.`
          : `Only send assets on ${network}. Tokens sent from another network, such as Ethereum, can be lost.`}
      </Warning>
      <ExplorerLink href={accountExplorerUrl(address, cluster)} name="Solscan" />
    </div>
  );
}

function EvmReceive({ chain, address, embedded }: { chain: EvmChainKey; address: string; embedded: boolean }) {
  const here = EVM_CHAINS[chain];
  const other = EVM_CHAINS[chain === "ethereum" ? "robinhood" : "ethereum"];
  return (
    <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4">
      <NetworkCard
        network={chain}
        label={here.name}
        detail={embedded ? "Your Elyra EVM wallet" : "Your linked EVM wallet"}
      />
      <AddressBlock address={address} />
      <Warning>
        Only send on {here.name}. This address is also yours on {other.name}, but each network keeps its own
        balance — funds sent on one never appear on the other. Never send from Solana.
      </Warning>
      <ExplorerLink href={evmAddressUrl(chain, address)} name={here.explorer.name} />
    </div>
  );
}
