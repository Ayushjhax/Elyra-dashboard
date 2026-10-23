/* ---------------------------------------------------------------------------
   Solana addresses.

   No dependency: a Solana address is a base58-encoded 32-byte public key, and
   recognising one is a character-set check and a length check. Pulling in a
   web3 library to do that would ship a few hundred kilobytes to the browser
   for two regular expressions.

   Shared rather than server-only. The client needs `truncate` and the explorer
   link; the server needs `isSolanaAddress` before it puts a string into an RPC
   call. Nothing here reads the environment, so it is safe on both sides.
--------------------------------------------------------------------------- */

import type { Cluster } from "@/lib/solana/cluster";

/** Base58 as Bitcoin defined it: no 0, O, I or l, because they misread. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Whether a string could be a Solana address.
 *
 * 32 bytes in base58 lands between 32 and 44 characters — the range rather
 * than a fixed width, because leading zero bytes encode as a single '1' each
 * and shorten the string. This is a shape check, not a curve check: it does
 * not prove the bytes are a valid ed25519 point, and it is not trying to.
 * Its job is to keep a malformed string out of an RPC call, and an address
 * that passes here and does not exist on chain simply reads as empty.
 */
export function isSolanaAddress(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && BASE58.test(value);
}

/** A transaction signature is 64 bytes in base58 — roughly twice an address. */
export function isSolanaSignature(value: string): boolean {
  return value.length >= 64 && value.length <= 88 && BASE58.test(value);
}

/**
 * `4Nd1…9wXy`.
 *
 * The ellipsis is a single U+2026 rather than three periods, so it cannot be
 * mistaken for part of the address when someone copies it out of a screenshot.
 */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

const EXPLORER = "https://solscan.io";

/**
 * Solscan's own cluster switch. Mainnet is its default and takes no
 * parameter; a devnet signature opened without one is "not found", which is
 * the wrong answer to give about a transaction that exists.
 */
function clusterQuery(cluster: Cluster | null | undefined): string {
  return cluster === "devnet" || cluster === "testnet" ? `?cluster=${cluster}` : "";
}

export function accountExplorerUrl(address: string, cluster?: Cluster | null): string {
  return `${EXPLORER}/account/${address}${clusterQuery(cluster)}`;
}

export function txExplorerUrl(signature: string, cluster?: Cluster | null): string {
  return `${EXPLORER}/tx/${signature}${clusterQuery(cluster)}`;
}
