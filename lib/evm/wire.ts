import type { EvmChainKey } from "@/lib/evm/chains";

/* ---------------------------------------------------------------------------
   An EVM transaction as it travels between the server that builds it, the
   wallet that signs it and the server that checks and sends it.

   Pure, so the browser and the Android app read the same shape the server
   writes (lib/evm/tx.ts builds, seals and verifies it).
--------------------------------------------------------------------------- */

/** A 0x-prefixed hex string — viem's `Hex`, spelled out so this module needs no package. */
export type Hex = `0x${string}`;

export type EvmTxPurpose = "transfer" | "approve" | "swap";

/**
 * A fully specified EIP-1559 transaction, as the server built it.
 *
 * Every number is a decimal string so it survives JSON exactly; a bigint
 * would not, and a float would round wei.
 */
export interface EvmTxRequest {
  chain: EvmChainKey;
  chainId: number;
  from: string;
  to: string;
  value: string;
  data: Hex;
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  purpose: EvmTxPurpose;
  /** Epoch ms. A seal older than `BUILD_TTL_MS` is refused. */
  builtAt: number;
}

/** What a build route returns: one transaction to sign, and its seal. */
export interface BuiltEvmStep {
  tx: EvmTxRequest;
  seal: string;
  /** The only address that may sign it. */
  signer: string;
  chain: EvmChainKey;
  summary: string;
  /** ETH: the most the network fee can cost. The actual charge is usually lower. */
  networkFeeMax: string;
}

/** What /api/evm/submit and /api/evm/status answer. */
export interface EvmTxStatus {
  status: "confirmed" | "failed" | "pending";
  hash?: string;
  href?: string;
  error?: string;
  /** Set when another transaction from the wallet took this one's place. */
  replaced?: boolean;
  /** Pending only: the signed bytes, for re-broadcasting while watching. */
  signedTransaction?: string;
}
