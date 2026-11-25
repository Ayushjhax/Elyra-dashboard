import { describe, expect, it } from "vitest";
import { pickCoinId, parseCoinMarkets, parseJupiterToken, parseRugcheck, parseYahooQuote } from "@/lib/analysis/parse";
import { safetyReport, sentimentScore, vixRegime, type SafetyInput } from "@/lib/analysis/score";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

/* Trimmed from Jupiter's live answer on 25 November 2026. */
const jupiterEntry = {
  id: JUP,
  name: "Jupiter",
  symbol: "JUP",
  twitter: "https://twitter.com/JupiterExchange",
  website: "https://jup.ag",
  telegram: "javascript:alert(1)",
  circSupply: 3319369204.37,
  totalSupply: 6861485613.07,
  holderCount: 835736,
  fdv: 1526722514.07,
  mcap: 738579949.39,
  usdPrice: 0.2225,
  liquidity: 4146288.59,
  stats24h: { priceChange: -5.21, holderChange: -0.008, buyVolume: 2626514.05, sellVolume: 2852703.34, numTraders: 10468, numNetBuyers: 1189 },
  firstPool: { id: "2psp", createdAt: "2024-01-29T17:33:29Z" },
  audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 14.86 },
  organicScore: 97.6,
  isVerified: true,
};

describe("parseJupiterToken", () => {
  it("reads the entry for exactly the mint asked, with https links only", () => {
    const stats = parseJupiterToken([{ ...jupiterEntry, id: "lookalike" }, jupiterEntry], JUP)!;
    expect(stats).toMatchObject({ symbol: "JUP", marketCapUsd: 738579949.39, holderCount: 835736, topHoldersPct: 14.86, mintAuthorityDisabled: true, verified: true });
    expect(stats.volume24hUsd).toBeCloseTo(2626514.05 + 2852703.34);
    expect(stats.links).toEqual({ website: "https://jup.ag/", twitter: "https://twitter.com/JupiterExchange", telegram: null, discord: null });
    expect(stats.firstPoolAt).toBe("2024-01-29T17:33:29Z");
  });

  it("is null when the mint is not in the answer", () => {
    expect(parseJupiterToken([{ ...jupiterEntry, id: "other" }], JUP)).toBeNull();
    expect(parseJupiterToken(null, JUP)).toBeNull();
  });

  it("keeps a missing number null, never zero", () => {
    expect(parseJupiterToken([{ id: JUP, mcap: "lots" }], JUP)?.marketCapUsd).toBeNull();
  });
});

describe("CoinGecko", () => {
  it("picks the best-ranked coin with exactly the symbol asked", () => {
    const body = {
      coins: [
        { id: "solana-copy", symbol: "SOL", market_cap_rank: 2500 },
        { id: "solv-protocol", symbol: "SOLV", market_cap_rank: 642 },
        { id: "solana", symbol: "SOL", name: "Solana", market_cap_rank: 7 },
        { id: "unranked-sol", symbol: "sol", market_cap_rank: null },
      ],
    };
    expect(pickCoinId(body, "sol")).toEqual({ id: "solana", name: "Solana", rank: 7 });
    expect(pickCoinId(body, "XYZ")).toBeNull();
    expect(pickCoinId({ coins: [{ id: "only", symbol: "ABC", market_cap_rank: null }] }, "ABC")).toEqual({ id: "only", name: "only", rank: null });
  });

  it("reads market rows", () => {
    const [btc] = parseCoinMarkets([
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        market_cap_rank: 1,
        current_price: 95000,
        price_change_percentage_24h_in_currency: -1.2,
        price_change_percentage_7d_in_currency: 4.5,
        market_cap: 1.9e12,
        fully_diluted_valuation: 2e12,
        total_volume: 3e10,
        circulating_supply: 19.9e6,
        total_supply: 19.9e6,
        max_supply: 21e6,
        ath: 126000,
        ath_change_percentage: -24.6,
      },
    ]);
    expect(btc).toMatchObject({ symbol: "BTC", rank: 1, change7dPct: 4.5, maxSupply: 21e6, athChangePct: -24.6 });
  });
});

describe("parseRugcheck", () => {
  it("reads the risks and Rugcheck's own score", () => {
    const summary = parseRugcheck({
      score: 101,
      score_normalised: 7,
      lpLockedPct: 1.44,
      risks: [{ name: "Mutable metadata", description: "Token metadata can be changed by the owner", level: "warn" }, { name: "", level: "danger" }],
    });
    expect(summary).toEqual({ riskScore: 7, lpLockedPct: 1.44, risks: [{ name: "Mutable metadata", description: "Token metadata can be changed by the owner", level: "warn" }] });
  });
});

describe("parseYahooQuote", () => {
  it("reads the level and the change against the previous close", () => {
    const quote = parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: 4.904, chartPreviousClose: 4.918 } }] } })!;
    expect(quote.price).toBe(4.904);
    expect(quote.changePct).toBeCloseTo(-0.2847, 3);
    expect(parseYahooQuote({ chart: { result: [] } })).toBeNull();
  });
});

describe("safetyReport", () => {
  const clean: SafetyInput = {
    controls: [
      { id: "mint", live: false },
      { id: "freeze", live: false },
    ],
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
    topHoldersPct: 14.9,
    liquidityUsd: 4_000_000,
    holderCount: 835_736,
    verified: true,
    issuerRun: false,
  };

  it("scores a clean token 100, with nothing deducted", () => {
    expect(safetyReport(clean)).toEqual({ score: 100, risk: "low", deductions: [], notes: [] });
  });

  it("deducts for every live power read on-chain, and says why", () => {
    const report = safetyReport({
      ...clean,
      controls: [
        { id: "mint", live: true },
        { id: "freeze", live: true },
        { id: "permanentDelegate", live: true },
      ],
    });
    expect(report.score).toBe(25);
    expect(report.risk).toBe("high");
    expect(report.deductions.map((entry) => entry.source)).toEqual(["chain", "chain", "chain"]);
    expect(report.deductions[0].reason).toMatch(/supply can be increased/);
  });

  it("deducts for concentration, thin liquidity, few holders and no verification", () => {
    const report = safetyReport({ ...clean, topHoldersPct: 62, liquidityUsd: 5_000, holderCount: 300, verified: false });
    expect(report.deductions.map((entry) => entry.points)).toEqual([20, 25, 10, 5]);
    expect(report.score).toBe(40);
  });

  it("falls back to Jupiter's audit when the chain cannot be read, and says so", () => {
    const report = safetyReport({ ...clean, controls: null, mintAuthorityDisabled: false });
    expect(report.deductions).toEqual([{ points: 25, reason: "A mint authority exists: supply can be increased.", source: "jupiter" }]);
    expect(report.notes.join(" ")).toMatch(/could not be read on-chain/);
  });

  it("explains an issuer-run token's authorities rather than hiding them", () => {
    const report = safetyReport({ ...clean, controls: [{ id: "freeze", live: true }], issuerRun: true });
    expect(report.score).toBe(80);
    expect(report.notes.join(" ")).toMatch(/issuer-run token/);
  });

  it("notes what it could not check", () => {
    expect(safetyReport({ ...clean, topHoldersPct: null, liquidityUsd: null }).notes).toHaveLength(2);
  });
});

describe("sentimentScore", () => {
  it("averages the readings it has, and lists each", () => {
    const result = sentimentScore({ fearGreed: 75, fundingAprPct: 15, change24hPct: 4, marketMedianChangePct: -1, buyVolumeUsd: 60, sellVolumeUsd: 40 });
    expect(result.contributions.map((entry) => entry.name)).toEqual(["fear_greed", "positioning", "relative_strength", "flows"]);
    expect(result.contributions.map((entry) => entry.value)).toEqual([0.5, 0.5, 0.5, 0.19999999999999996]);
    expect(result.score).toBe(71);
    expect(result.label).toBe("bullish");
  });

  it("clamps an extreme reading, and reads fear as bearish", () => {
    const result = sentimentScore({ fearGreed: 10, fundingAprPct: -90, change24hPct: null, marketMedianChangePct: null, buyVolumeUsd: null, sellVolumeUsd: null });
    expect(result.contributions.map((entry) => entry.value)).toEqual([-0.8, -1]);
    expect(result.score).toBe(5);
    expect(result.label).toBe("bearish");
  });

  it("gives no score with nothing to read", () => {
    expect(sentimentScore({ fearGreed: null, fundingAprPct: null, change24hPct: null, marketMedianChangePct: null, buyVolumeUsd: null, sellVolumeUsd: null })).toEqual({
      score: null,
      label: null,
      contributions: [],
    });
  });
});

describe("vixRegime", () => {
  it("reads the VIX by its conventional bands", () => {
    expect([12, 17, 26.4, 35].map(vixRegime)).toEqual(["calm", "normal", "elevated", "high fear"]);
  });
});
