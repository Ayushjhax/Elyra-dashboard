import { describe, expect, it } from "vitest";
import {
  evmWalletRows,
  multiplierFromChain,
  parseStockRegistry,
  stockTokenPrice,
  unitsToNumber,
  type TokenBalanceRead,
} from "@/lib/evm/derive";
import {
  EVM_CHAINS,
  evmAddressUrl,
  evmChainNamed,
  evmScopeId,
  evmTokenUrl,
  isEvmAddress,
} from "@/lib/evm/chains";
import { EVM_TOKENS } from "@/lib/evm/tokens";
import { evmChainOf, isSolanaScope, marketSymbolOf, onSolanaWallet } from "@/lib/portfolio/chain";

const WEI = BigInt("1000000000000000000");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const SCOPE = evmScopeId("robinhood", ADDRESS);

function token(over: Partial<TokenBalanceRead> = {}): TokenBalanceRead {
  return {
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    raw: BigInt(250_000_000),
    logo: null,
    stable: true,
    priceUsd: 1,
    ...over,
  };
}

describe("unitsToNumber", () => {
  it("scales by decimals without losing a large integer part", () => {
    expect(unitsToNumber(BigInt(0), 18)).toBe(0);
    expect(unitsToNumber(BigInt(1_500_000), 6)).toBe(1.5);
    expect(unitsToNumber(WEI * BigInt(3) + WEI / BigInt(4), 18)).toBe(3.25);
    /* 12,345,678.9 ETH in wei is beyond 2^53; the split keeps the whole part exact. */
    expect(unitsToNumber(BigInt("12345678900000000000000000"), 18)).toBe(12345678.9);
  });
});

describe("Robinhood stock tokens", () => {
  const registry = {
    assets: [
      {
        tokenSymbol: "CRWD",
        tokenName: "CrowdStrike • Robinhood Token",
        status: "ASSET_STATUS_ACTIVE",
        tokenDecimals: 18,
        currentMultiplier: "4.000000000000000000",
        logoUrl: "https://cdn.robinhood.com/ncw_assets/logos/0xabc.png",
        deployments: [{ contractAddress: "0x2222222222222222222222222222222222222222", chainId: 4663 }],
      },
      /* Inactive, on another chain, malformed, and a duplicate: all dropped. */
      { tokenSymbol: "OLD", status: "ASSET_STATUS_INACTIVE", deployments: [{ contractAddress: "0x3333333333333333333333333333333333333333", chainId: 4663 }] },
      { tokenSymbol: "TEST", status: "ASSET_STATUS_ACTIVE", deployments: [{ contractAddress: "0x4444444444444444444444444444444444444444", chainId: 46630 }] },
      { tokenSymbol: "BAD", status: "ASSET_STATUS_ACTIVE", deployments: [{ contractAddress: "not-an-address", chainId: 4663 }] },
      { tokenSymbol: "CRWD", status: "ASSET_STATUS_ACTIVE", deployments: [{ contractAddress: "0x2222222222222222222222222222222222222222", chainId: 4663 }] },
      /* No multiplier and no decimals: the documented launch values. */
      { tokenSymbol: "aapl", tokenName: "Apple • Robinhood Token", status: "ASSET_STATUS_ACTIVE", deployments: [{ contractAddress: "0x5555555555555555555555555555555555555555", chainId: 4663 }] },
    ],
  };

  it("keeps only active tokens deployed on Robinhood Chain, once each", () => {
    const tokens = parseStockRegistry(registry);
    expect(tokens.map((entry) => entry.symbol)).toEqual(["CRWD", "AAPL"]);
    expect(tokens[0]).toMatchObject({ decimals: 18, multiplier: 4, logo: "https://cdn.robinhood.com/ncw_assets/logos/0xabc.png" });
    expect(tokens[1]).toMatchObject({ decimals: 18, multiplier: 1, logo: null });
  });

  it("reads nothing from a body it does not recognise", () => {
    expect(parseStockRegistry(null)).toEqual([]);
    expect(parseStockRegistry({ assets: "nope" })).toEqual([]);
    expect(parseStockRegistry([])).toEqual([]);
  });

  it("values a token at the share price times its multiplier", () => {
    /* A 4:1 split: one token is four shares. */
    expect(stockTokenPrice(100, 4)).toBe(400);
    expect(stockTokenPrice(null, 1)).toBeNull();
    expect(stockTokenPrice(0, 1)).toBeNull();
  });

  it("reads uiMultiplier as 18-decimal fixed point", () => {
    expect(multiplierFromChain(WEI * BigInt(4))).toBe(4);
    expect(multiplierFromChain(BigInt("1001148322800714293"))).toBeCloseTo(1.0011483228, 9);
    expect(multiplierFromChain(BigInt(0))).toBeNull();
    expect(multiplierFromChain(null)).toBeNull();
  });
});

describe("evmWalletRows", () => {
  it("turns balances into verified wallet holdings under one scope", () => {
    const rows = evmWalletRows({
      chain: "robinhood",
      address: ADDRESS,
      scopeId: SCOPE,
      nativeRaw: WEI / BigInt(2),
      ethUsd: 3000,
      ethLogo: "eth.png",
      tokens: [
        token(),
        token({
          address: "0x2222222222222222222222222222222222222222",
          symbol: "CRWD",
          name: "CrowdStrike • Robinhood Token",
          decimals: 18,
          raw: WEI * BigInt(2),
          stable: false,
          priceUsd: stockTokenPrice(100, 4),
          marketSymbol: null,
          stockToken: { ticker: "CRWD", multiplier: 4 },
        }),
      ],
    });

    expect(rows.valueUsd).toBe(1500 + 250 + 800);
    expect(rows.stableUsd).toBe(250);
    expect(rows.unpriced).toBe(0);
    expect(rows.holdings.map((row) => [row.symbol, row.valueUsd])).toEqual([
      ["ETH", 1500],
      ["USDG", 250],
      ["CRWD", 800],
    ]);
    for (const row of rows.holdings) {
      expect(row).toMatchObject({ venue: "wallet", chain: "Robinhood Chain", scopeId: SCOPE, verified: true });
      expect(row.id.startsWith(`${SCOPE}:`)).toBe(true);
    }
    expect(rows.holdings[1].liquid).toBe(true);
    expect(rows.holdings[2]).toMatchObject({ marketSymbol: null, stockToken: { ticker: "CRWD", multiplier: 4 } });
    expect(rows.holdings[0].name).toBe("Ether on Robinhood Chain");
  });

  it("shows an unpriced holding without counting it, and drops priced dust and zeroes", () => {
    const rows = evmWalletRows({
      chain: "ethereum",
      address: ADDRESS,
      scopeId: evmScopeId("ethereum", ADDRESS),
      nativeRaw: BigInt(1_000_000_000), // 1 gwei of ETH: dust at any real price
      ethUsd: 3000,
      ethLogo: null,
      tokens: [
        token({ symbol: "LINK", stable: false, decimals: 18, raw: WEI, priceUsd: null }),
        token({ symbol: "USDC", raw: BigInt(0) }),
      ],
    });
    expect(rows.holdings.map((row) => row.symbol)).toEqual(["LINK"]);
    expect(rows.holdings[0].valueUsd).toBeNull();
    expect(rows.unpriced).toBe(1);
    expect(rows.valueUsd).toBe(0);
  });

  it("shows a token on no trusted list without pricing or counting it", () => {
    const rows = evmWalletRows({
      chain: "ethereum", address: ADDRESS, scopeId: evmScopeId("ethereum", ADDRESS),
      nativeRaw: BigInt(0), ethUsd: 3000, ethLogo: null,
      tokens: [token({ symbol: "USDC", name: "Totally USDC", priceUsd: 1, verified: false, address: "0x9999999999999999999999999999999999999999" })],
    });
    expect(rows.holdings[0]).toMatchObject({ symbol: "USDC", verified: false, valueUsd: null, priceUsd: null, logo: null, marketSymbol: null, liquid: false });
    expect(rows).toMatchObject({ valueUsd: 0, stableUsd: 0, unverified: 1, unpriced: 0 });
  });

  it("lists ETH unpriced rather than at zero when there is no ETH price", () => {
    const rows = evmWalletRows({
      chain: "ethereum", address: ADDRESS, scopeId: evmScopeId("ethereum", ADDRESS),
      nativeRaw: WEI, ethUsd: null, ethLogo: null, tokens: [],
    });
    expect(rows.holdings[0]).toMatchObject({ symbol: "ETH", quantity: 1, valueUsd: null, priceUsd: null });
    expect(rows.valueUsd).toBe(0);
  });
});

describe("the EVM chains", () => {
  it("names each chain and links it to its own explorer", () => {
    expect(EVM_CHAINS.robinhood.id).toBe(4663);
    expect(EVM_CHAINS.ethereum.id).toBe(1);
    expect(evmAddressUrl("robinhood", ADDRESS)).toBe(`https://robinhoodchain.blockscout.com/address/${ADDRESS}`);
    expect(evmTokenUrl("ethereum", ADDRESS)).toBe(`https://etherscan.io/token/${ADDRESS}`);
    expect(evmChainNamed("Robinhood Chain")?.key).toBe("robinhood");
    expect(evmChainNamed("Solana")).toBeNull();
  });

  it("tells an EVM address from anything else", () => {
    expect(isEvmAddress(ADDRESS)).toBe(true);
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isEvmAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(false);
    expect(isEvmAddress(null)).toBe(false);
  });

  it("gives one address a scope per chain, whatever its case", () => {
    expect(evmScopeId("ethereum", ADDRESS.toUpperCase().replace("0X", "0x"))).toBe(`ethereum:${ADDRESS}`);
    expect(evmScopeId("robinhood", ADDRESS)).not.toBe(evmScopeId("ethereum", ADDRESS));
  });

  it("lists every token once per chain, at a well-formed address", () => {
    for (const tokens of Object.values(EVM_TOKENS)) {
      const addresses = tokens.map((entry) => entry.address.toLowerCase());
      expect(new Set(addresses).size).toBe(addresses.length);
      for (const entry of tokens) {
        expect(isEvmAddress(entry.address)).toBe(true);
        expect(entry.decimals).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("which network a holding is on", () => {
  const base = { venue: "wallet", symbol: "USDC" } as const;

  it("keeps Solana-only flows to the Solana wallet", () => {
    expect(onSolanaWallet({ ...base, chain: "Solana" })).toBe(true);
    expect(onSolanaWallet({ ...base, chain: "Ethereum" })).toBe(false);
    expect(onSolanaWallet({ venue: "binance", chain: "—" })).toBe(false);
    expect(evmChainOf({ ...base, chain: "Robinhood Chain" })?.key).toBe("robinhood");
    expect(evmChainOf({ venue: "hyperliquid", chain: "Ethereum" })).toBeNull();
  });

  it("finds the Solana scope by its address, not by venue", () => {
    expect(isSolanaScope({ venue: "wallet", address: ADDRESS })).toBe(false);
    expect(isSolanaScope({ venue: "wallet", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" })).toBe(true);
  });

  it("asks market venues about a wrapped token as its underlying, and about a stock token not at all", () => {
    expect(marketSymbolOf({ symbol: "sol" })).toBe("SOL");
    expect(marketSymbolOf({ symbol: "WETH", marketSymbol: "ETH" })).toBe("ETH");
    expect(marketSymbolOf({ symbol: "V", marketSymbol: null })).toBeNull();
  });
});
