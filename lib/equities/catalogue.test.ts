import { describe, expect, it } from "vitest";
import { baseName, groupEquities, matches, premiumPct, tickerOf, type EquityToken } from "@/lib/equities/catalogue";

const token = (overrides: Partial<EquityToken>): EquityToken => ({
  issuer: "backed",
  symbol: "TSLAX",
  name: "Tesla xStock",
  chain: "solana",
  address: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  ticker: "TSLA",
  priceUsd: 251,
  swap: { symbol: "TSLAX" },
  ...overrides,
});

describe("tickerOf", () => {
  it("reads the share from each issuer's symbol", () => {
    expect(tickerOf("backed", "TSLAX")).toBe("TSLA");
    expect(tickerOf("ondo", "TSLAON")).toBe("TSLA");
    expect(tickerOf("ondo", "GOOGLON")).toBe("GOOGL");
    expect(tickerOf("robinhood", "AAPL")).toBe("AAPL");
    expect(tickerOf("sunrise", "HOOD")).toBe("HOOD");
  });

  it("reads nothing from a symbol that does not follow its issuer's pattern", () => {
    expect(tickerOf("backed", "TSLA")).toBeNull();
    expect(tickerOf("ondo", "TSLAX")).toBeNull();
    expect(tickerOf("sunrise", "$$$")).toBeNull();
  });
});

describe("premiumPct", () => {
  it("compares one token with one share", () => {
    expect(premiumPct(251, 250)).toBe(0.4);
    expect(premiumPct(245, 250)).toBe(-2);
    expect(premiumPct(null, 250)).toBeNull();
    expect(premiumPct(251, 0)).toBeNull();
  });
});

describe("groupEquities", () => {
  const shares = new Map([["TSLA", { name: "Tesla Inc", priceUsd: 250, session: "regular" }]]);

  it("groups every issuer's token under its share, issuers in a fixed order", () => {
    const groups = groupEquities(
      [
        token({}),
        token({ issuer: "ondo", symbol: "TSLAON", name: "Tesla (Ondo)", priceUsd: 249, address: "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo" }),
        token({ issuer: "sunrise", symbol: "TSLA", name: "Tesla", priceUsd: 252.5, address: "S1" }),
        token({ issuer: "robinhood", symbol: "TSLA", chain: "robinhood", priceUsd: null, swap: null, address: "0x1" }),
      ],
      shares,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ ticker: "TSLA", name: "Tesla Inc", shareUsd: 250, session: "regular" });
    expect(groups[0].tokens.map((entry) => entry.issuer)).toEqual(["sunrise", "backed", "ondo", "robinhood"]);
    expect(groups[0].tokens.map((entry) => entry.premiumPct)).toEqual([1, 0.4, -0.4, null]);
  });

  it("keeps a token whose share is unknown, under its own symbol, unpriced", () => {
    const groups = groupEquities([token({ issuer: "sunrise", symbol: "SV151", name: "Pokémon 151 booster", ticker: null })], shares);
    expect(groups[0]).toMatchObject({ ticker: "SV151", shareUsd: null });
    expect(groups[0].tokens[0].premiumPct).toBeNull();
  });

  it("sorts shares by ticker", () => {
    const groups = groupEquities([token({ ticker: "TSLA" }), token({ ticker: "AAPL", symbol: "AAPLX", address: "a" })], new Map());
    expect(groups.map((group) => group.ticker)).toEqual(["AAPL", "TSLA"]);
  });
});

describe("matches and baseName", () => {
  it("finds a share by ticker, name or any token's symbol", () => {
    const [group] = groupEquities([token({})], new Map([["TSLA", { name: "Tesla Inc", priceUsd: 250, session: null }]]));
    expect(matches(group, "tsla")).toBe(true);
    expect(matches(group, "tesla")).toBe(true);
    expect(matches(group, "tslax")).toBe(true);
    expect(matches(group, "apple")).toBe(false);
    expect(matches(group, "  ")).toBe(true);
  });

  it("names the company, not the token", () => {
    expect(baseName("Tesla xStock")).toBe("Tesla");
    expect(baseName("Tesla (Ondo)")).toBe("Tesla");
    expect(baseName("S&P 500 xStock")).toBe("S&P 500");
  });
});
