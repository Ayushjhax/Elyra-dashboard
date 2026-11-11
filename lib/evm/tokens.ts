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

/* Base, Arbitrum and BNB Chain: each address read back from its contract on
   2026-11-11 like the lists above (`symbol()`, `decimals()`), and each price
   symbol checked against Pyth's catalogue. Wrapped gas coins price as the
   coin itself; Binance-peg and bridged tokens price as their underlying. */

const BASE: readonly EvmToken[] = [
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6, priceSymbol: "USDC", stable: true },
  { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", symbol: "USDbC", name: "USD Base Coin (bridged USDC)", decimals: 6, priceSymbol: "USDC", stable: true, marketSymbol: "USDC" },
  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", name: "Dai", decimals: 18, priceSymbol: "DAI", stable: true },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceSymbol: "ETH", stable: false, marketSymbol: "ETH" },
  { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8, priceSymbol: "CBBTC", stable: false, marketSymbol: "BTC" },
  { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18, priceSymbol: "CBETH", stable: false },
  { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO", name: "Aerodrome", decimals: 18, priceSymbol: "AERO", stable: false },
  { address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", symbol: "VIRTUAL", name: "Virtuals Protocol", decimals: 18, priceSymbol: "VIRTUAL", stable: false },
  { address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", symbol: "DEGEN", name: "Degen", decimals: 18, priceSymbol: "DEGEN", stable: false },
  { address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", symbol: "BRETT", name: "Brett", decimals: 18, priceSymbol: "BRETT", stable: false },
];

const ARBITRUM: readonly EvmToken[] = [
  { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", name: "USD Coin", decimals: 6, priceSymbol: "USDC", stable: true },
  { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT0", name: "USD₮0 (Tether)", decimals: 6, priceSymbol: "USDT", stable: true, marketSymbol: "USDT" },
  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI", name: "Dai", decimals: 18, priceSymbol: "DAI", stable: true },
  { address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", symbol: "USDe", name: "Ethena USDe", decimals: 18, priceSymbol: "USDE", stable: true },
  { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceSymbol: "ETH", stable: false, marketSymbol: "ETH" },
  { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, priceSymbol: "WBTC", stable: false, marketSymbol: "BTC" },
  { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", symbol: "ARB", name: "Arbitrum", decimals: 18, priceSymbol: "ARB", stable: false },
  { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", symbol: "GMX", name: "GMX", decimals: 18, priceSymbol: "GMX", stable: false },
  { address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", symbol: "LINK", name: "Chainlink", decimals: 18, priceSymbol: "LINK", stable: false },
  { address: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", symbol: "PENDLE", name: "Pendle", decimals: 18, priceSymbol: "PENDLE", stable: false },
];

const BSC: readonly EvmToken[] = [
  { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD (BSC)", decimals: 18, priceSymbol: "USDT", stable: true },
  { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin (BSC)", decimals: 18, priceSymbol: "USDC", stable: true },
  { address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", symbol: "FDUSD", name: "First Digital USD", decimals: 18, priceSymbol: "FDUSD", stable: true },
  { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", symbol: "DAI", name: "Dai (BSC)", decimals: 18, priceSymbol: "DAI", stable: true },
  { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", name: "Wrapped BNB", decimals: 18, priceSymbol: "BNB", stable: false, marketSymbol: "BNB" },
  { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH", name: "Ethereum (Binance-peg)", decimals: 18, priceSymbol: "ETH", stable: false },
  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", name: "Bitcoin (Binance-peg)", decimals: 18, priceSymbol: "BTC", stable: false, marketSymbol: "BTC" },
  { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", symbol: "CAKE", name: "PancakeSwap", decimals: 18, priceSymbol: "CAKE", stable: false },
  { address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", symbol: "XRP", name: "XRP (Binance-peg)", decimals: 18, priceSymbol: "XRP", stable: false },
  { address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", symbol: "DOGE", name: "Dogecoin (Binance-peg)", decimals: 8, priceSymbol: "DOGE", stable: false },
];

export const EVM_TOKENS: Record<EvmChainKey, readonly EvmToken[]> = {
  ethereum: ETHEREUM,
  base: BASE,
  arbitrum: ARBITRUM,
  bsc: BSC,
  robinhood: ROBINHOOD,
};
