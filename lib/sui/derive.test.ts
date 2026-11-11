import { describe, expect, it } from "vitest";
import { SUI_COIN_TYPE, normalizeCoinType, suiScopeId } from "@/lib/sui/chain";
import { checkSuiSwap, suiActivityRows, suiWalletRows, type SuiBalanceRead } from "@/lib/sui/derive";
import { checkLifiSuiQuote, LIFI_SUI_CHAIN_ID } from "@/lib/sui/swap";
import { SUI_TOKENS, suiTokenBySymbol } from "@/lib/sui/tokens";

const OWNER = `0x${"a".repeat(64)}`;
const OTHER = `0x${"b".repeat(64)}`;
const USDC = suiTokenBySymbol("USDC")?.coinType ?? "";
const SCOPE = suiScopeId(OWNER);

const coin = (over: Partial<SuiBalanceRead>): SuiBalanceRead => ({
  coinType: SUI_COIN_TYPE,
  raw: BigInt(2_000_000_000),
  decimals: 9,
  symbol: "SUI",
  name: "Sui",
  logo: null,
  priceUsd: 3,
  verified: true,
  stable: false,
  ...over,
});

describe("Sui chain helpers", () => {
  it("writes a coin type one way whatever its address padding", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe(SUI_COIN_TYPE);
    expect(normalizeCoinType(SUI_COIN_TYPE)).toBe(SUI_COIN_TYPE);
  });

  it("lists each coin once, by its full type, with SUI on the list", () => {
    const types = SUI_TOKENS.map((token) => token.coinType);
    expect(new Set(types).size).toBe(types.length);
    expect(types.every((type) => type === normalizeCoinType(type))).toBe(true);
    expect(suiTokenBySymbol("sui")?.coinType).toBe(SUI_COIN_TYPE);
  });
});

describe("suiWalletRows", () => {
  it("puts SUI first, values what is verified, and counts stablecoins as such", () => {
    const rows = suiWalletRows({
      scopeId: SCOPE,
      balances: [
        coin({ coinType: USDC, raw: BigInt(5_000_000), decimals: 6, symbol: "USDC", priceUsd: 1, stable: true }),
        coin({}),
      ],
    });
    expect(rows.holdings.map((holding) => holding.symbol)).toEqual(["SUI", "USDC"]);
    expect(rows.holdings[0]).toMatchObject({ chain: "Sui", venue: "wallet", scopeId: SCOPE, address: null, quantity: 2, valueUsd: 6 });
    expect(rows.holdings[1]).toMatchObject({ address: USDC, valueUsd: 5, liquid: true });
    expect(rows.valueUsd).toBe(11);
    expect(rows.stableUsd).toBe(5);
  });

  it("shows an unverified coin, never valued, never counted, and never asked for a market", () => {
    const fake = `0x${"c".repeat(64)}::usdc::USDC`;
    const rows = suiWalletRows({ scopeId: SCOPE, balances: [coin({ coinType: fake, symbol: "USDC", priceUsd: 1, verified: false, logo: "https://x" })] });
    expect(rows.holdings[0]).toMatchObject({ verified: false, priceUsd: null, valueUsd: null, logo: null, marketSymbol: null, liquid: false });
    expect(rows.valueUsd).toBe(0);
  });

  it("drops priced dust and empty balances", () => {
    const rows = suiWalletRows({ scopeId: SCOPE, balances: [coin({ raw: BigInt(1_000) }), coin({ coinType: USDC, raw: BigInt(0) })] });
    expect(rows.holdings).toEqual([]);
  });
});

describe("suiActivityRows", () => {
  const lookup = (type: string) => (type === USDC ? { symbol: "USDC", decimals: 6 } : { symbol: null, decimals: 9 });

  it("reads a send as the coin that moved, not the gas it cost, and links the explorer", () => {
    const [row] = suiActivityRows(
      OWNER,
      [
        {
          digest: "Dig1",
          sender: OWNER,
          timestamp: "2026-11-01T00:00:00Z",
          success: true,
          changes: [
            { owner: OWNER, coinType: USDC, amount: "-2500000" },
            { owner: OWNER, coinType: "0x2::sui::SUI", amount: "-1500000" },
            { owner: OTHER, coinType: USDC, amount: "2500000" },
          ],
        },
      ],
      lookup,
      10,
    );
    expect(row).toMatchObject({ signature: "Dig1", network: "sui", status: "confirmed", href: "https://suiscan.xyz/mainnet/tx/Dig1" });
    expect(row.summary?.amounts.map((amount) => amount.symbol)).toEqual(["USDC"]);
    expect(row.summary?.amounts[0]?.amount).toBe(-2.5);
  });

  it("keeps a SUI transfer, drops repeats, and orders newest first up to the limit", () => {
    const node = (digest: string, at: string) => ({
      digest,
      sender: OTHER,
      timestamp: at,
      success: true,
      changes: [{ owner: OWNER, coinType: SUI_COIN_TYPE, amount: "1000000000" }],
    });
    const rows = suiActivityRows(OWNER, [node("A", "2026-11-01T00:00:00Z"), node("B", "2026-11-02T00:00:00Z"), node("A", "2026-11-01T00:00:00Z")], lookup, 5);
    expect(rows.map((row) => row.signature)).toEqual(["B", "A"]);
    expect(rows[0].summary?.amounts[0]).toMatchObject({ symbol: "SUI", amount: 1 });
    expect(suiActivityRows(OWNER, [node("A", "2026-11-01T00:00:00Z"), node("B", "2026-11-02T00:00:00Z")], lookup, 1)).toHaveLength(1);
  });
});

describe("checkSuiSwap", () => {
  const swap = {
    owner: OWNER,
    fromType: SUI_COIN_TYPE,
    fromAmount: BigInt(1_000_000_000),
    toType: USDC,
    toAmountMin: BigInt(2_900_000),
    gasBudget: BigInt(10_000_000),
  };

  it("passes a swap that pays the owner at least the minimum and takes no more than asked plus gas", () => {
    expect(
      checkSuiSwap({
        ...swap,
        changes: [
          { owner: OWNER, coinType: SUI_COIN_TYPE, amount: "-1004000000" },
          { owner: OWNER, coinType: USDC, amount: "2950000" },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it("refuses one that pays someone else, or short", () => {
    const result = checkSuiSwap({
      ...swap,
      changes: [
        { owner: OWNER, coinType: SUI_COIN_TYPE, amount: "-1000000000" },
        { owner: OTHER, coinType: USDC, amount: "2950000" },
      ],
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/less than/) });
  });

  it("refuses one that takes more than asked", () => {
    const result = checkSuiSwap({
      ...swap,
      changes: [
        { owner: OWNER, coinType: SUI_COIN_TYPE, amount: "-1500000000" },
        { owner: OWNER, coinType: USDC, amount: "2950000" },
      ],
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/more than/) });
  });

  it("allows no gas headroom when the coin sold is not SUI", () => {
    const result = checkSuiSwap({
      ...swap,
      fromType: USDC,
      fromAmount: BigInt(3_000_000),
      toType: SUI_COIN_TYPE,
      toAmountMin: BigInt(900_000_000),
      changes: [
        { owner: OWNER, coinType: USDC, amount: "-3000001" },
        { owner: OWNER, coinType: SUI_COIN_TYPE, amount: "990000000" },
      ],
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("checkLifiSuiQuote", () => {
  const want = { fromType: SUI_COIN_TYPE, toType: USDC, fromAmount: "1000000000", address: OWNER };
  const quote = (over: { action?: object; estimate?: object; transactionRequest?: object } = {}) => ({
    tool: "cetus",
    action: {
      fromChainId: LIFI_SUI_CHAIN_ID,
      toChainId: LIFI_SUI_CHAIN_ID,
      fromToken: { address: "0x2::sui::SUI" },
      toToken: { address: USDC },
      fromAmount: "1000000000",
      fromAddress: OWNER,
      toAddress: OWNER,
      ...over.action,
    },
    estimate: { toAmount: "3000000", toAmountMin: "2985000", feeCosts: [{ amountUSD: "0.01", included: true }], ...over.estimate },
    transactionRequest: { data: "AAAB", ...over.transactionRequest },
  });

  it("accepts the swap that was asked for, short and long coin types alike", () => {
    expect(checkLifiSuiQuote(quote(), want)).toEqual({
      ok: true,
      quote: { bytes: "AAAB", toAmount: "3000000", toAmountMin: "2985000", tool: "cetus", feeUsd: 0.01 },
    });
  });

  it("refuses a quote that pays another address, or names another chain, coin or amount", () => {
    expect(checkLifiSuiQuote(quote({ action: { toAddress: OTHER } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/recipient/) });
    expect(checkLifiSuiQuote(quote({ action: { toChainId: 1 } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/network/) });
    expect(checkLifiSuiQuote(quote({ action: { toToken: { address: `0x${"c".repeat(64)}::usdc::USDC` } } }), want)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/coin bought/),
    });
    expect(checkLifiSuiQuote(quote({ action: { fromAmount: "2000000000" } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/amount/) });
    expect(checkLifiSuiQuote(quote({ estimate: { toAmountMin: "4000000" } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/amount bought/) });
    expect(checkLifiSuiQuote(quote({ transactionRequest: { data: "not base64!" } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/transaction/) });
    expect(checkLifiSuiQuote(null, want)).toMatchObject({ ok: false });
  });
});
