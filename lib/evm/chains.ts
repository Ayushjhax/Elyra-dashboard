/* ---------------------------------------------------------------------------
   The EVM networks Elyra reads: Ethereum and Robinhood Chain.

   Pure and dependency-free, so the website and the Android app name a chain,
   link an address and tell an EVM address from a Solana one the same way. The
   RPC clients that read these chains are server-only (lib/evm/rpc.ts); only
   what a screen needs to label and link lives here.

   One address serves both. An account's EVM wallet is a single key, valid on
   every EVM chain, so the same 0x address holds ETH on Ethereum and ETH on
   Robinhood Chain — two balances, two ledgers, and funds sent on one never
   appear on the other. Every surface that shows the address names the chain
   beside it for that reason.

   Robinhood Chain is an Arbitrum L2 with ETH as its gas token. Its id, RPC
   and explorer are from docs.robinhood.com/chain/connecting and match viem's
   own `robinhood` definition.
--------------------------------------------------------------------------- */

export type EvmChainKey = "ethereum" | "robinhood";

export interface EvmChain {
  key: EvmChainKey;
  /** EIP-155 chain id. Checked against the node on every read. */
  id: number;
  /** As a holding's `chain` and a scope's label carry it. */
  name: string;
  /** For a tight cell. */
  shortName: string;
  nativeSymbol: "ETH";
  explorer: { name: string; url: string };
}

export const EVM_CHAINS: Record<EvmChainKey, EvmChain> = {
  ethereum: {
    key: "ethereum",
    id: 1,
    name: "Ethereum",
    shortName: "Ethereum",
    nativeSymbol: "ETH",
    explorer: { name: "Etherscan", url: "https://etherscan.io" },
  },
  robinhood: {
    key: "robinhood",
    id: 4663,
    name: "Robinhood Chain",
    shortName: "Robinhood",
    nativeSymbol: "ETH",
    explorer: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
};

/** In the order every surface lists them. */
export const EVM_CHAIN_KEYS: readonly EvmChainKey[] = ["ethereum", "robinhood"];

/** A 20-byte hex address. Checksum case is not enforced: Privy and the session store differ. */
export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** The chain a holding or scope names by `chain`, or null for a non-EVM one. */
export function evmChainNamed(name: string): EvmChain | null {
  for (const key of EVM_CHAIN_KEYS) {
    if (EVM_CHAINS[key].name === name) return EVM_CHAINS[key];
  }
  return null;
}

/**
 * The portfolio scope id for one chain's read of the EVM wallet.
 *
 * Chain-qualified because the address alone is not unique: the same 0x key
 * is read twice, once per chain. Lower-cased so a checksummed and a plain
 * spelling of one address are one scope.
 */
export function evmScopeId(chain: EvmChainKey, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

export function evmAddressUrl(chain: EvmChainKey, address: string): string {
  return `${EVM_CHAINS[chain].explorer.url}/address/${address}`;
}

export function evmTokenUrl(chain: EvmChainKey, token: string): string {
  return `${EVM_CHAINS[chain].explorer.url}/token/${token}`;
}

export function evmTxUrl(chain: EvmChainKey, hash: string): string {
  return `${EVM_CHAINS[chain].explorer.url}/tx/${hash}`;
}
