/* ---------------------------------------------------------------------------
   Which Solana cluster the configured RPC actually points at.

   The spec asks for a warning when the wallet is on the wrong chain. On EVM
   that is a chain id the wallet reports; Solana has no equivalent, because a
   keypair is valid on every cluster and the endpoint alone decides which
   ledger you are reading. So "which network am I on" is answered by asking
   the node for its genesis hash — the one value that differs between clusters
   and never changes within one.

   These three hashes were read from api.mainnet-beta / api.devnet /
   api.testnet rather than recalled, because a wrong constant here produces
   the worst possible outcome: a devnet balance displayed as real money, with
   a green "mainnet" label next to it.
--------------------------------------------------------------------------- */

export const GENESIS_HASH = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
} as const;

export type KnownCluster = keyof typeof GENESIS_HASH;
/** "unknown" covers a local validator or a fork, both of which are not mainnet. */
export type Cluster = KnownCluster | "unknown";

/** What this app expects to be reading. Anything else warrants a banner. */
export const EXPECTED_CLUSTER: KnownCluster = "mainnet-beta";

export function clusterOf(genesisHash: string): Cluster {
  for (const [name, hash] of Object.entries(GENESIS_HASH)) {
    if (hash === genesisHash) return name as KnownCluster;
  }
  return "unknown";
}

/** How the cluster is written in the UI. */
export const CLUSTER_LABEL: Record<Cluster, string> = {
  "mainnet-beta": "Solana mainnet",
  devnet: "Solana devnet",
  testnet: "Solana testnet",
  unknown: "Unrecognised Solana cluster",
};
