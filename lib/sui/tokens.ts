import { normalizeCoinType, SUI_COIN_TYPE } from "@/lib/sui/chain";

/* ---------------------------------------------------------------------------
   The Sui coins Elyra trusts — by Move type, not by name.

   The same rule as lib/evm/tokens.ts: a coin is counted only when its type is
   on this list, so a coin minted to impersonate USDC under some other package
   is shown unverified and never counted. Every type below was read back from
   its on-chain metadata (`coinMetadata`: symbol, decimals) on 2026-11-11, and
   every price symbol checked against Pyth's catalogue.

   Liquid-staking receipts (haSUI, vSUI) are deliberately absent: each is
   worth a drifting multiple of SUI, Pyth prices neither, and pricing one as
   SUI would be wrong by exactly the yield it has earned.
--------------------------------------------------------------------------- */

export interface SuiToken {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Pyth crypto ticker. */
  priceSymbol: string;
  stable: boolean;
}

const RAW: readonly SuiToken[] = [
  { coinType: SUI_COIN_TYPE, symbol: "SUI", name: "Sui", decimals: 9, priceSymbol: "SUI", stable: false },
  { coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", symbol: "USDC", name: "USD Coin", decimals: 6, priceSymbol: "USDC", stable: true },
  { coinType: "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT", symbol: "USDT", name: "Tether (Sui Bridge)", decimals: 6, priceSymbol: "USDT", stable: true },
  { coinType: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD", symbol: "AUSD", name: "Agora USD", decimals: 6, priceSymbol: "AUSD", stable: true },
  { coinType: "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK", symbol: "BUCK", name: "Bucket USD", decimals: 9, priceSymbol: "BUCK", stable: true },
  { coinType: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL", symbol: "WAL", name: "Walrus", decimals: 9, priceSymbol: "WAL", stable: false },
  { coinType: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP", symbol: "DEEP", name: "DeepBook", decimals: 6, priceSymbol: "DEEP", stable: false },
  { coinType: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS", symbol: "CETUS", name: "Cetus", decimals: 9, priceSymbol: "CETUS", stable: false },
  { coinType: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS", symbol: "NS", name: "SuiNS", decimals: 6, priceSymbol: "NS", stable: false },
  { coinType: "0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL", symbol: "HAEDAL", name: "Haedal", decimals: 9, priceSymbol: "HAEDAL", stable: false },
  { coinType: "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA", symbol: "IKA", name: "Ika", decimals: 9, priceSymbol: "IKA", stable: false },
  { coinType: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX", symbol: "NAVX", name: "NAVI Protocol", decimals: 9, priceSymbol: "NAVX", stable: false },
  { coinType: "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE", symbol: "BLUE", name: "Bluefin", decimals: 9, priceSymbol: "BLUE", stable: false },
];

/** Every listed coin, by its normalized type. */
export const SUI_TOKENS: readonly SuiToken[] = RAW.map((token) => ({ ...token, coinType: normalizeCoinType(token.coinType) }));

export function suiTokenByType(coinType: string): SuiToken | null {
  const wanted = normalizeCoinType(coinType);
  return SUI_TOKENS.find((token) => token.coinType === wanted) ?? null;
}

export function suiTokenBySymbol(symbol: string): SuiToken | null {
  const wanted = symbol.trim().toUpperCase();
  return SUI_TOKENS.find((token) => token.symbol.toUpperCase() === wanted) ?? null;
}
