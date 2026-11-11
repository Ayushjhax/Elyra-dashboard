/* ---------------------------------------------------------------------------
   Sui — the account's wallet on Sui mainnet, named and linked.

   Pure and dependency-free, shared with the app through lib/core.ts. The
   clients that read and write the chain are server-only (lib/sui/client.ts).

   Sui is not an EVM chain: a Sui address is 32 bytes (0x and 64 hex), coins
   are named by their Move type ("0x2::sui::SUI"), and the account's Sui
   wallet is its own key — a Privy embedded wallet on Sui — not the EVM one.
   Every surface that shows it says "Sui" beside it.
--------------------------------------------------------------------------- */

export const SUI_NAME = "Sui";

export const SUI_EXPLORER = { name: "Suiscan", url: "https://suiscan.xyz/mainnet" } as const;

/** SUI's own Move type, in the long form every read returns. */
export const SUI_COIN_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export function isSuiAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * A coin type in one canonical spelling: the package address padded to 64
 * hex digits and lower-cased, module and name as written. "0x2::sui::SUI"
 * and its long form are the same coin and compare equal after this.
 */
export function normalizeCoinType(coinType: string): string {
  const parts = coinType.trim().split("::");
  if (parts.length < 3) return coinType.trim();
  const address = parts[0].toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,64}$/.test(address)) return coinType.trim();
  return [`0x${address.padStart(64, "0")}`, ...parts.slice(1)].join("::");
}

export function isCoinType(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim());
}

/** The portfolio scope id for the Sui wallet. */
export function suiScopeId(address: string): string {
  return `sui:${address.toLowerCase()}`;
}

export function suiAddressUrl(address: string): string {
  return `${SUI_EXPLORER.url}/account/${address}`;
}

export function suiTxUrl(digest: string): string {
  return `${SUI_EXPLORER.url}/tx/${digest}`;
}

export function suiCoinUrl(coinType: string): string {
  return `${SUI_EXPLORER.url}/coin/${coinType}`;
}
