import type { EvmChainKey } from "@/lib/evm/chains";

/* ---------------------------------------------------------------------------
   The ERC-20s Elyra reads on each EVM chain.

   A fixed list, not an indexer's "everything this address holds". That makes
   every listed token verified by construction: a balance is read only at the
   canonical contract, so an airdropped lookalike named "USDC" at some other
   address is never seen, let alone counted. The cost is coverage — a token
   not listed here is not shown — which is the same trade the Solana side
   makes by counting only Jupiter-verified mints.

   Every address, symbol and decimals value below was read back from the
   contract itself (`symbol()`, `decimals()`) on 2026-11-11 before it was
   written here. Robinhood Chain's WETH and USDG are the two contracts
   docs.robinhood.com/chain/contracts lists; its stock tokens come from
   Robinhood's live registry instead (lib/evm/stockTokens.ts), since that
   list changes as listings do.

   `priceSymbol` is the Pyth crypto ticker the token is priced under — WETH at
   ETH's, since it redeems 1:1. `marketSymbol` is what market venues know it
   by for 24h change and candles, where that differs from its own symbol.
--------------------------------------------------------------------------- */

export interface EvmToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceSymbol: string;
  /** Counts toward available capital at face value. */
  stable: boolean;
  /** Absent: the token's own symbol. */
  marketSymbol?: string;
}

const ETHEREUM: readonly EvmToken[] = [
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6, priceSymbol: "USDC", stable: true },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, priceSymbol: "USDT", stable: true },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai", decimals: 18, priceSymbol: "DAI", stable: true },
  { address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", symbol: "PYUSD", name: "PayPal USD", decimals: 6, priceSymbol: "PYUSD", stable: true },
  { address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", symbol: "USDG", name: "Global Dollar", decimals: 6, priceSymbol: "USDG", stable: true },
  { address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", symbol: "USDe", name: "Ethena USDe", decimals: 18, priceSymbol: "USDE", stable: true },
  { address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", symbol: "USDS", name: "USDS", decimals: 18, priceSymbol: "USDS", stable: true },
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceSymbol: "ETH", stable: false, marketSymbol: "ETH" },
  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, priceSymbol: "WBTC", stable: false, marketSymbol: "BTC" },
  { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8, priceSymbol: "CBBTC", stable: false, marketSymbol: "BTC" },
  { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", symbol: "stETH", name: "Lido Staked Ether", decimals: 18, priceSymbol: "STETH", stable: false },
  { address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", symbol: "wstETH", name: "Wrapped stETH", decimals: 18, priceSymbol: "WSTETH", stable: false },
  { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "Chainlink", decimals: 18, priceSymbol: "LINK", stable: false },
  { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", name: "Uniswap", decimals: 18, priceSymbol: "UNI", stable: false },
  { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", name: "Aave", decimals: 18, priceSymbol: "AAVE", stable: false },
  { address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", symbol: "LDO", name: "Lido DAO", decimals: 18, priceSymbol: "LDO", stable: false },
  { address: "0x57e114B691Db790C35207b2e685D4A43181e6061", symbol: "ENA", name: "Ethena", decimals: 18, priceSymbol: "ENA", stable: false },
  { address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", symbol: "ONDO", name: "Ondo", decimals: 18, priceSymbol: "ONDO", stable: false },
  { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", symbol: "PEPE", name: "Pepe", decimals: 18, priceSymbol: "PEPE", stable: false },
  { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", name: "Shiba Inu", decimals: 18, priceSymbol: "SHIB", stable: false },
];

const ROBINHOOD: readonly EvmToken[] = [
  { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceSymbol: "ETH", stable: false, marketSymbol: "ETH" },
  { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", name: "Global Dollar", decimals: 6, priceSymbol: "USDG", stable: true },
];

export const EVM_TOKENS: Record<EvmChainKey, readonly EvmToken[]> = {
  ethereum: ETHEREUM,
  robinhood: ROBINHOOD,
};
