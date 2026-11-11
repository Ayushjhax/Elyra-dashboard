import { evmChainNamed, type EvmChain } from "@/lib/evm/chains";
import type { SpotHolding, WalletScope } from "@/lib/portfolio/types";
import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   Which network a holding is on.

   Wallet holdings on every chain share `venue: "wallet"` — they are all spot
   balances in the account's own wallets, and the Spot account, the chain
   allocation and the tables treat them alike. What does NOT carry across is
   anything Solana-specific: a Jupiter swap, the Asset Passport, a Solana
   purchase spending USDC. Those ask `onSolanaWallet`, never the venue, so an
   Ethereum USDC balance is never offered to a Solana flow as if it were
   spendable there.
--------------------------------------------------------------------------- */

/** The `chain` every Solana wallet holding carries. */
export const SOLANA_CHAIN = "Solana";

/**
 * Held in the account's Solana wallet: a wallet holding on no EVM chain.
 * Solana is the only other chain a wallet is read on, and asking it this way
 * round keeps a row that spells its chain differently ("solana") a Solana row
 * rather than quietly dropping it from every Solana flow.
 */
export function onSolanaWallet(holding: Pick<SpotHolding, "venue" | "chain">): boolean {
  return holding.venue === "wallet" && evmChainNamed(holding.chain) === null;
}

/** The EVM chain a wallet holding is on, or null for Solana and venues. */
export function evmChainOf(holding: Pick<SpotHolding, "venue" | "chain">): EvmChain | null {
  return holding.venue === "wallet" ? evmChainNamed(holding.chain) : null;
}

/** The account's Solana wallet scope — by its address, which no EVM scope shares. */
export function isSolanaScope(scope: Pick<WalletScope, "venue" | "address">): boolean {
  return scope.venue === "wallet" && scope.address !== null && isSolanaAddress(scope.address);
}

/**
 * The ticker market venues should be asked about for this holding, or null
 * when none should be — see `SpotHolding.marketSymbol`.
 */
export function marketSymbolOf(holding: Pick<SpotHolding, "symbol" | "marketSymbol">): string | null {
  if (holding.marketSymbol === null) return null;
  return (holding.marketSymbol ?? holding.symbol).toUpperCase();
}
