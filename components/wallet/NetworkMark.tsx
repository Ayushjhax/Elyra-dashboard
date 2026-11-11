"use client";

import { CoinMark } from "@/components/ui/CoinMark";
import { EVM_CHAINS, type EvmChainKey } from "@/lib/evm/chains";
import { useTickerLogos } from "@/lib/market/tickerLogos";

/* ---------------------------------------------------------------------------
   The mark for a network the account holds a wallet on.

   Solana and Ethereum wear their coins' artwork, from the same catalogue as
   every other logo. Robinhood Chain has no coin of its own — its gas token is
   ETH — and is drawn as the lettered monogram rather than with a borrowed
   brand mark: a network label, never a suggestion of affiliation.
--------------------------------------------------------------------------- */

export type Network = "solana" | EvmChainKey;

export const NETWORK_NAME: Record<Network, string> = {
  solana: "Solana",
  ethereum: EVM_CHAINS.ethereum.name,
  robinhood: EVM_CHAINS.robinhood.name,
};

const COINS = ["SOL", "ETH"] as const;

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
  if (network === "robinhood") {
    return <CoinMark symbol={EVM_CHAINS.robinhood.name} size={size} className={className} />;
  }
  const symbol = network === "solana" ? "SOL" : "ETH";
  return <CoinMark symbol={symbol} {...logos(symbol)} size={size} className={className} />;
}
