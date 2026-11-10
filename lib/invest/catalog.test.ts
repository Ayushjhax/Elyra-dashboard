import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, PORTFOLIOS, catalogSymbols, portfolioById } from "@/lib/invest/catalog";
import { minimumInvestmentUsd } from "@/lib/invest/plan";
import { assetFor } from "@/lib/trade";

/* The catalog is a promise that each portfolio can be bought. These hold it
   to the swap allowlist, which is the only place a symbol becomes tradable. */

describe("the Intelligent Portfolios catalog", () => {
  it("publishes seven portfolios with unique, URL-safe ids", () => {
    expect(PORTFOLIOS).toHaveLength(7);
    const ids = PORTFOLIOS.map((portfolio) => portfolio.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(portfolioById("ai-leaders")?.name).toBe("AI leaders");
    expect(portfolioById("nope")).toBeNull();
  });

  it("weights every portfolio to exactly 100%", () => {
    for (const portfolio of PORTFOLIOS) {
      const sum = portfolio.holdings.reduce((total, holding) => total + holding.weightBps, 0);
      expect(sum, portfolio.id).toBe(10_000);
      for (const holding of portfolio.holdings) {
        expect(Number.isInteger(holding.weightBps), `${portfolio.id} ${holding.symbol}`).toBe(true);
        expect(holding.weightBps, `${portfolio.id} ${holding.symbol}`).toBeGreaterThan(0);
      }
    }
  });

  it("holds only assets the swap route will trade", () => {
    for (const symbol of catalogSymbols()) {
      expect(assetFor(symbol), symbol).not.toBeNull();
    }
  });

  it("lists each holding once per portfolio", () => {
    for (const portfolio of PORTFOLIOS) {
      const symbols = portfolio.holdings.map((holding) => holding.symbol);
      expect(new Set(symbols).size, portfolio.id).toBe(symbols.length);
    }
  });

  it("names each holding by its issuer's ticker, which matches the allowlist key", () => {
    for (const portfolio of PORTFOLIOS) {
      for (const holding of portfolio.holdings) {
        expect(holding.ticker.toUpperCase(), holding.ticker).toBe(holding.symbol);
      }
    }
  });

  it("claims no third party designed or endorses a portfolio", () => {
    const words = PORTFOLIOS.flatMap((portfolio) => [portfolio.name, portfolio.summary, ...portfolio.thesis]).join(" ");
    expect(words).not.toMatch(/blackrock|powered by|in partnership|endorsed/i);
  });

  it("files every portfolio under a listed category, and stays buyable from a modest amount", () => {
    for (const portfolio of PORTFOLIOS) {
      expect(CATEGORY_ORDER).toContain(portfolio.category);
      expect(minimumInvestmentUsd(portfolio), portfolio.id).toBeLessThanOrEqual(100);
      expect(portfolio.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
