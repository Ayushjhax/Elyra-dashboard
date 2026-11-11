import { EVM_CHAIN_KEYS, EVM_CHAINS, evmChainNamed, type EvmChain, type EvmChainKey } from "@/lib/evm/chains";
import { SUI_EXPLORER, SUI_NAME } from "@/lib/sui/chain";
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
 * Held in the account's Solana wallet: a wallet holding on no EVM chain and
 * not on Sui. Asking it this way round keeps a row that spells its chain
 * differently ("solana") a Solana row rather than quietly dropping it from
 * every Solana flow.
 */
export function onSolanaWallet(holding: Pick<SpotHolding, "venue" | "chain">): boolean {
  return holding.venue === "wallet" && evmChainNamed(holding.chain) === null && holding.chain !== SUI_NAME;
}

/** Held in the account's Sui wallet. */
export function onSuiWallet(holding: Pick<SpotHolding, "venue" | "chain">): boolean {
  return holding.venue === "wallet" && holding.chain === SUI_NAME;
}

/* ---------------------------------------------------------------------------
   Every network a wallet is read on, named once
--------------------------------------------------------------------------- */

export type WalletNetwork = "solana" | EvmChainKey | "sui";

/** In the order every surface lists them. */
export const WALLET_NETWORKS: readonly WalletNetwork[] = ["solana", ...EVM_CHAIN_KEYS, "sui"];

export function networkName(network: WalletNetwork): string {
  return network === "solana" ? "Solana" : network === "sui" ? SUI_NAME : EVM_CHAINS[network].name;
}

export function networkShortName(network: WalletNetwork): string {
  return network === "solana" ? "Solana" : network === "sui" ? SUI_NAME : EVM_CHAINS[network].shortName;
}

/** The explorer a network's transactions open on. */
export function explorerName(network: WalletNetwork | undefined): string {
  return network === undefined || network === "solana" ? "Solscan" : network === "sui" ? SUI_EXPLORER.name : EVM_CHAINS[network].explorer.name;
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
