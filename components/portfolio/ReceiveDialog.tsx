"use client";

import { useState } from "react";
import { ExternalLink, Network as NetworkIcon, TriangleAlert } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton } from "@/components/shell/RouteDrawer";
import { OptionMenu } from "@/components/ui/OptionMenu";
import { QrCode } from "@/components/ui/QrCode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NETWORK_NAME, NetworkMark, type Network } from "@/components/wallet/NetworkMark";
import { EVM_CHAIN_KEYS, EVM_CHAINS, evmAddressUrl, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import { isSuiAddress, suiAddressUrl, SUI_EXPLORER } from "@/lib/sui/chain";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Where to send funds.

   One network at a time, named outright. The account holds three wallets —
   Solana; one EVM wallet whose single address is valid on Ethereum, Base,
   Arbitrum, BNB Chain and Robinhood Chain; and Sui — so the dialog asks
   which network first and then says which wallet and which network in
   words, beside the code, rather than leaving the person to infer it from
   an address's shape.

   The EVM networks show the same address on purpose, and say why: the key
   is the same, the ledgers are not. ETH sent on Base lands on Base and is
   not visible on Ethereum, which is the mistake the warning under each code
   exists to prevent.

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
  const suiAddress = isSuiAddress(auth.suiAddress) ? auth.suiAddress : null;
  const [chosen, setChosen] = useState<Network>(initial);
  /* Reopened from a different entry point, the dialog starts where that
     entry point asked rather than where it was last left. */
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) setChosen(initial);
  }

  /* Every network this account has a wallet on, in the app's order. */
  const networks: Network[] = [
    "solana",
    ...(evmAddress === null ? [] : EVM_CHAIN_KEYS),
    ...(suiAddress === null ? [] : (["sui"] as const)),
  ];
  const network: Network = networks.includes(chosen) ? chosen : "solana";

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
              : network === "sui"
                ? "Send SUI or Sui coins to this address."
                : `Send ${EVM_CHAINS[network].nativeSymbol} or tokens on ${NETWORK_NAME[network]} to this address.`}
          </DialogDescription>
        </DialogHeader>

        {networks.length > 1 && (
          <div className="shrink-0 border-b border-border-subtle px-4 py-2">
            <OptionMenu
              label="Network"
              icon={NetworkIcon}
              value={network}
              onChange={(id) => setChosen(id as Network)}
              options={networks.map((key) => ({ id: key, label: NETWORK_NAME[key] }))}
            />
          </div>
        )}

        {/* The dialog is capped in height; the body scrolls under the header
            and the network menu rather than clipping the explorer link off
            a short screen. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {network === "solana" ? (
            <SolanaReceive address={address} cluster={cluster} embedded={auth.account?.solanaIsEmbedded === true} />
          ) : network === "sui" ? (
            <SuiReceive address={suiAddress as string} />
          ) : (
            <EvmReceive chain={network} address={evmAddress as string} embedded={evmEmbedded} />
          )}
        </div>
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
  return (
    <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4">
      <NetworkCard
        network={chain}
        label={here.name}
        detail={embedded ? "Your Elyra EVM wallet" : "Your linked EVM wallet"}
      />
      <AddressBlock address={address} />
      <Warning>
        Only send on {here.name}. This address is also yours on the other EVM networks, but each keeps its own
        balance — funds sent on one never appear on another. Never send from Solana or Sui.
      </Warning>
      <ExplorerLink href={evmAddressUrl(chain, address)} name={here.explorer.name} />
    </div>
  );
}

function SuiReceive({ address }: { address: string }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4">
      <NetworkCard network="sui" label="Sui" detail="Your Elyra Sui wallet" />
      <AddressBlock address={address} />
      <Warning>
        Only send SUI or Sui coins, on Sui. A Sui address is longer than an EVM one and is not the same wallet —
        funds sent from Ethereum or Solana can be lost.
      </Warning>
      <ExplorerLink href={suiAddressUrl(address)} name={SUI_EXPLORER.name} />
    </div>
  );
}
