import "server-only";

import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, robinhood } from "viem/chains";
import { optional } from "@/lib/env";
import type { EvmChainKey } from "@/lib/evm/chains";

/* ---------------------------------------------------------------------------
   Read-only clients for the EVM chains.

   Server-only, like SOLANA_RPC_URL: the browser never reads a chain directly,
   so a paid endpoint's key never ships in the bundle. Nothing here signs or
   sends — these clients read balances and nothing else.

   Each chain falls back to a public endpoint so a fresh deployment shows
   balances before anyone provisions a key. Both are rate-limited and are not
   meant for production traffic — Robinhood says so of its own — so set
   ETHEREUM_RPC_URL and ROBINHOOD_RPC_URL to a provider of your own (one
   Alchemy key covers both). The node's chain id is checked on every read
   regardless (lib/evm/wallet.ts), so a URL pointed at the wrong network
   reports itself rather than showing that network's balances as these.
--------------------------------------------------------------------------- */

const FALLBACK: Record<EvmChainKey, string> = {
  /* Allnodes' public node: no key, and checked to answer eth_chainId 0x1. */
  ethereum: "https://ethereum-rpc.publicnode.com",
  /* Robinhood's own public endpoint (docs.robinhood.com/chain/connecting). */
  robinhood: "https://rpc.mainnet.chain.robinhood.com",
};

export const RPC_ENV: Record<EvmChainKey, "ETHEREUM_RPC_URL" | "ROBINHOOD_RPC_URL"> = {
  ethereum: "ETHEREUM_RPC_URL",
  robinhood: "ROBINHOOD_RPC_URL",
};

/** True when the chain is read from a configured endpoint rather than the public fallback. */
export function rpcIsPublic(chain: EvmChainKey): boolean {
  return optional(RPC_ENV[chain]) === undefined;
}

const clients = new Map<string, PublicClient>();

/** One client per chain and URL, built on first use and reused. */
export function evmClient(chain: EvmChainKey): PublicClient {
  const url = optional(RPC_ENV[chain]) ?? FALLBACK[chain];
  const key = `${chain}:${url}`;
  const existing = clients.get(key);
  if (existing !== undefined) return existing;

  const client = createPublicClient({
    chain: chain === "ethereum" ? mainnet : robinhood,
    transport: http(url, { timeout: 10_000, retryCount: 1 }),
  }) as PublicClient;
  clients.set(key, client);
  return client;
}
