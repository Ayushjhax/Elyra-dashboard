import { parseBacktestRequest } from "@/lib/backtest/parse";
import { reportRequest } from "@/lib/research/intent";
import { pdfName } from "~/lib/pdf";

/* What the Research tab decides before it asks the API: which report a typed
   line becomes, what a typed backtest runs (or compares), and the name a
   downloaded PDF is saved under. */

jest.mock("expo-file-system", () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock("expo-sharing", () => ({}));

describe("reportRequest", () => {
  it("makes a bare ticker or name an earnings report", () => {
    expect(reportRequest("NVDA", "auto")).toBe("NVDA latest earnings");
    expect(reportRequest("  microsoft ", "auto")).toBe("microsoft latest earnings");
  });

  it("keeps a question's own intent, and names the type when one is chosen", () => {
    expect(reportRequest("NVDA 10-Q", "auto")).toBe("NVDA 10-Q");
    expect(reportRequest("NVDA", "10-K")).toBe("NVDA 10-K");
    expect(reportRequest("AAPL", "earnings")).toBe("AAPL latest earnings");
  });
});

describe("a typed backtest", () => {
  it("runs one strategy with what was said", () => {
    const parsed = parseBacktestRequest("SOL rsi 12 1h 1y");
    expect(parsed).toMatchObject({ symbol: "SOL", timeframe: "1h", days: 365 });
    expect(parsed.strategyIds).toEqual(["RSI_12_MEAN_REVERSION_V1"]);
  });

  it("compares when several are named, and asks when none is", () => {
    expect(parseBacktestRequest("compare macd, rsi and bollinger on sol").strategyIds.length).toBe(3);
    expect(parseBacktestRequest("backtest something clever on btc").strategyIds).toEqual([]);
  });
});

describe("pdfName", () => {
  it("is a safe file name, never empty", () => {
    expect(pdfName("NVIDIA CORP · Q2 FY2027")).toBe("NVIDIA-CORP-Q2-FY2027.pdf");
    expect(pdfName("···")).toBe("Elyra-report.pdf");
  });
});
