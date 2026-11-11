import { describe, expect, it } from "vitest";
import {
  EXCHANGES,
  FX_PAIRS,
  GLOBAL_BENCHMARKS,
  REGION_EXTRAS,
  displayName,
  movers,
  overviewSymbols,
  parsePythSymbol,
  yahooCandidates,
} from "@/lib/markets/exchanges";

/* ---------------------------------------------------------------------------
   The exchange list, the Yahoo symbols that give each feed's previous close,
   and the movers and breadth computed from them.
--------------------------------------------------------------------------- */

describe("the exchange list", () => {
  it("has unique ids, a schedule feed for each, and parseable symbols throughout", () => {
    expect(new Set(EXCHANGES.map((exchange) => exchange.id)).size).toBe(EXCHANGES.length);
    for (const exchange of EXCHANGES) {
      expect(parsePythSymbol(exchange.scheduleFrom)).not.toBeNull();
      for (const benchmark of exchange.benchmarks) expect(parsePythSymbol(benchmark.pythSymbol)?.klass).toBe("Equity");
    }
    for (const pair of FX_PAIRS) expect(parsePythSymbol(pair)?.klass).toBe("FX");
    expect(overviewSymbols().length).toBeGreaterThan(30);
  });

  it("labels every fund as a fund, and every New York fund as New York", () => {
    const all = [...EXCHANGES.flatMap((exchange) => exchange.benchmarks), ...Object.values(REGION_EXTRAS).flatMap((extra) => extra.benchmarks), ...GLOBAL_BENCHMARKS];
    for (const benchmark of all) {
      if (benchmark.kind === "us-fund" && !GLOBAL_BENCHMARKS.includes(benchmark)) expect(benchmark.label).toContain("New York");
      if (benchmark.kind !== "index") expect(benchmark.label).toMatch(/fund|iShares|Vanguard/);
    }
  });

  it("covers Asia-Pacific, Europe and the Americas, London included", () => {
    expect(new Set(EXCHANGES.map((exchange) => exchange.region))).toEqual(new Set(["asia", "europe", "americas"]));
    expect(EXCHANGES.map((exchange) => exchange.city)).toEqual(
      expect.arrayContaining(["New York", "London", "Frankfurt", "Paris", "Tokyo", "Hong Kong", "Seoul", "Mumbai"]),
    );
  });
});

describe("parsePythSymbol", () => {
  it("splits equity and FX feeds", () => {
    expect(parsePythSymbol("Equity.JP.7203/JPY")).toEqual({ klass: "Equity", region: "JP", base: "7203", quote: "JPY" });
    expect(parsePythSymbol("FX.USD/JPY")).toEqual({ klass: "FX", region: null, base: "USD", quote: "JPY" });
    expect(parsePythSymbol("nonsense")).toBeNull();
  });
});

describe("yahooCandidates", () => {
  it.each([
    ["Equity.US.AAPL/USD", ["AAPL"]],
    ["Equity.US.BRK.B/USD", ["BRK-B"]],
    ["Equity.Index.US500/USD", ["^GSPC"]],
    ["Equity.Index.JP225/JPY", ["^N225"]],
    ["Equity.Index.KR200/KRW", ["^KS200"]],
    ["Equity.JP.7203/JPY", ["7203.T"]],
    ["Equity.JP.285A/JPY", ["285A.T"]],
    ["Equity.HK.0700/HKD", ["0700.HK"]],
    ["Equity.KR.005930/KRW", ["005930.KS", "005930.KQ"]],
    ["Equity.CN.600519/CNY", ["600519.SS"]],
    ["Equity.CN.688981/CNY", ["688981.SS"]],
    ["Equity.CN.300308/CNY", ["300308.SZ"]],
    ["Equity.TW.2330/TWD", ["2330.TW"]],
    ["Equity.IN.NIFTYBEES/INR", ["NIFTYBEES.NS"]],
    ["FX.USD/JPY", ["USDJPY=X"]],
    ["Equity.GB.ISF/GBP", []],
    ["Equity.Index.NVDA/USD", []],
  ])("maps %s to %o", (symbol, expected) => {
    expect(yahooCandidates(symbol)).toEqual(expected);
  });
});

describe("displayName", () => {
  it("title-cases the description and keeps acronyms", () => {
    expect(displayName("TOYOTA MOTOR CORPORATION / JAPANESE YEN", "7203")).toBe("Toyota Motor Corporation");
    expect(displayName("SK HYNIX / SOUTH KOREAN WON", "000660")).toBe("SK Hynix");
    expect(displayName(null, "0700")).toBe("0700");
    expect(displayName("PYTH PRICE IN JPY FOR JP225 24/7", "JP225")).toBe("JP225");
    expect(displayName("ISHARES MSCI JAPAN ETF / US DOLLAR", "EWJ")).toBe("Ishares MSCI Japan ETF");
    expect(displayName("VODAFONE GROUP PLC ADR / US DOLLAR", "VOD")).toBe("Vodafone Group PLC ADR");
    expect(displayName("COCA-COLA EUROPACIFIC PARTNERS PLC / US DOLLAR", "CCEP")).toBe("Coca-Cola Europacific Partners PLC");
  });
});

describe("movers", () => {
  const quote = (ticker: string, changePct: number | null) => ({ ticker, changePct });

  it("ranks gainers and losers and counts breadth, leaving unknowns out of the ranking", () => {
    const result = movers([quote("A", 2.5), quote("B", -1), quote("C", 0.001), quote("D", null), quote("E", 0.4), quote("F", -3.2)], 2);
    expect(result.gainers.map((q) => q.ticker)).toEqual(["A", "E"]);
    expect(result.losers.map((q) => q.ticker)).toEqual(["F", "B"]);
    expect(result.breadth).toEqual({ up: 2, down: 2, flat: 1, unknown: 1 });
  });
});
