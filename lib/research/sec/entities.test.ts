import { describe, expect, it } from "vitest";
import { rankEntities } from "@/lib/research/sec/entities";

const rows = [
  { cik: "0000320193", ticker: "AAPL", companyName: "Apple Inc." },
  { cik: "0001418121", ticker: "APLE", companyName: "Apple Hospitality REIT, Inc." },
  { cik: "0001045810", ticker: "NVDA", companyName: "NVIDIA CORP" },
];

describe("company search", () => {
  it("finds a CIK exactly, with or without its leading zeros", () => {
    expect(rankEntities(rows, "0000320193").map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(rankEntities(rows, "320193").map((row) => row.ticker)).toEqual(["AAPL"]);
    /* Never a prefix: 1045 is not NVIDIA's 0001045810. */
    expect(rankEntities(rows, "1045")).toEqual([]);
  });

  it("still ranks tickers and names as before", () => {
    expect(rankEntities(rows, "aapl").map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(rankEntities(rows, "apple").map((row) => row.ticker)).toEqual(["AAPL", "APLE"]);
    expect(rankEntities(rows, "  ")).toEqual([]);
  });
});
