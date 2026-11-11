"use client";

import { CoinMark } from "@/components/ui/CoinMark";
import { EVM_CHAINS, type EvmChainKey } from "@/lib/evm/chains";
import { useTickerLogos } from "@/lib/market/tickerLogos";

/* ---------------------------------------------------------------------------
   The mark for a network the account holds a wallet on.

   Solana, Ethereum, Arbitrum, BNB Chain and Sui wear their coins' artwork,
   from the same catalogue as every other logo. Base and Robinhood Chain have
   no coin of their own — both pay gas in ETH — and are drawn as the lettered
   monogram rather than with a borrowed brand mark: a network label, never a
   suggestion of affiliation.
--------------------------------------------------------------------------- */

export type Network = "solana" | EvmChainKey | "sui";

export const NETWORK_NAME: Record<Network, string> = {
  solana: "Solana",
  ethereum: EVM_CHAINS.ethereum.name,
  base: EVM_CHAINS.base.name,
  arbitrum: EVM_CHAINS.arbitrum.name,
  bsc: EVM_CHAINS.bsc.name,
  robinhood: EVM_CHAINS.robinhood.name,
  sui: "Sui",
};

/* A network drawn by its own coin's artwork, where it has one. Base and
   Robinhood Chain have no coin of their own and get their letters. */
const COIN_OF: Partial<Record<Network, string>> = {
  solana: "SOL",
  ethereum: "ETH",
  arbitrum: "ARB",
  bsc: "BNB",
  sui: "SUI",
};

const COINS = ["SOL", "ETH", "ARB", "BNB", "SUI"] as const;

export function NetworkMark({
  network,
  size = 24,
  className,
}: {
  network: Network;
  size?: number;
  className?: string;
}) {
  const logos = useTickerLogos(COINS);
  const coin = COIN_OF[network];
  if (coin === undefined) {
    return <CoinMark symbol={NETWORK_NAME[network]} size={size} className={className} />;
  }
  return <CoinMark symbol={coin} {...logos(coin)} size={size} className={className} />;
}
