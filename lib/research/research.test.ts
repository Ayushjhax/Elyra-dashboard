import { describe, expect, it, vi } from "vitest";
import { parseResearchIntent, reportRequest } from "@/lib/research/intent";
import {
  agreementOf,
  agreesWithinRounding,
  divergenceBps,
  freeCashFlow,
  margin,
  marginChangePoints,
  percentChange,
  supplyRatio,
} from "@/lib/research/calculations";
import { resolveMetric, resolvePriorYear, samePeriod } from "@/lib/research/sec/xbrl";
import { findEarningsFilings, selectFilings, type SecFiling } from "@/lib/research/sec/filings";

/* ---------------------------------------------------------------------------
   The research layer.

   Every fixture below is the shape observed live against the SEC while
   building this, and two of these tests exist because the live run produced a
   wrong answer that looked entirely plausible: a six-year-old revenue figure
   reported as "latest", and the 2323% gross margin that followed from it.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Intent
--------------------------------------------------------------------------- */

describe("intent", () => {
  it("routes the product-bar question to an earnings report", () => {
    const task = parseResearchIntent("What is the latest earnings report for NVDA?");
    expect(task.intent).toBe("earnings_report");
    expect(task.subject).toEqual({ kind: "registrant", query: "NVDA" });
    expect(task.requires).toContain("sec.resolve_company");
  });

  it("prefers an explicitly named form over generic earnings words", () => {
    /* "NVDA 10-K earnings" wants the annual report, not the latest quarter —
       a named form is the least ambiguous request a user can make. */
    expect(parseResearchIntent("make an NVIDIA 10-K report").intent).toBe("company_10k_report");
    expect(parseResearchIntent("NVDA 10-Q earnings").intent).toBe("company_10q_report");
  });

  it("separates the non-SEC verticals", () => {
    expect(parseResearchIntent("what happened after market today").intent).toBe("market_recap");
    expect(parseResearchIntent("show me Kamino yield").intent).toBe("yield_discovery");
    expect(parseResearchIntent("what token unlocks are coming").intent).toBe("token_unlocks");
    expect(parseResearchIntent("compare SOL on Binance and Jupiter").intent).toBe(
      "cross_venue_compare",
    );
  });

  it("reads venues and windows out of the question", () => {
    const task = parseResearchIntent("compare SOL on Binance and Jupiter");
    expect(task.venues).toEqual(["binance", "jupiter"]);
    expect(parseResearchIntent("what unlocks are coming this week").windowHours).toBe(168);
  });

  it("does not read a crypto ticker as a company", () => {
    /* "SOL earnings" must not fetch SEC filings for a registrant named SOL. */
    const task = parseResearchIntent("SOL signals");
    expect(task.intent).toBe("signal_request");
    expect(task.subject).toEqual({ kind: "crypto", symbol: "SOL" });
  });

  it("does not invent a registrant from ordinary words", () => {
    /* Routing an unrecognised question to an SEC pipeline on the strength of
       a capitalised word fetches filings for a company nobody asked about. */
    const task = parseResearchIntent("What should I do today?");
    expect(task.intent).toBe("custom_research");
    expect(task.subject).toEqual({ kind: "none" });
  });

  it("marks equity price as optional, never required", () => {
    /* No equity provider is configured. An earnings report still has to
       generate from SEC data, minus the price-reaction section. */
    const task = parseResearchIntent("latest NVDA earnings");
    expect(task.requires).not.toContain("market.equity_price");
    expect(task.optional).toContain("market.equity_price");
  });
});

/* ---------------------------------------------------------------------------
   Filing selection
--------------------------------------------------------------------------- */

function filing(over: Partial<SecFiling> = {}): SecFiling {
  return {
    accession: "0001045810-26-000075",
    form: "10-Q",
    formKind: "10-Q",
    isAmendment: false,
    filedAt: "2026-08-26",
    periodEnd: "2026-07-26",
    items: [],
    primaryDocument: "nvda-20260726.htm",
    indexUrl: "https://example.test/index.htm",
    documentUrl: "https://example.test/doc.htm",
    cik: "0001045810",
    ...over,
  };
}

describe("filing selection", () => {
  it("orders by the period reported on, not the filing date", () => {
    /* An amendment to an old quarter is filed AFTER the current quarter's
       report. Ordering by filing date makes the stale period win. */
    const current = filing({ periodEnd: "2026-07-26", filedAt: "2026-08-26" });
    const amendedOld = filing({
      accession: "old-a",
      form: "10-Q/A",
      isAmendment: true,
      periodEnd: "2025-10-26",
      filedAt: "2026-09-30",
    });

    const rows = selectFilings([amendedOld, current], "10-Q");
    expect(rows[0].periodEnd).toBe("2026-07-26");
  });

  it("treats an amendment as the later word on the same period", () => {
    const original = filing({ accession: "orig", filedAt: "2026-08-26" });
    const amendment = filing({
      accession: "amend",
      form: "10-Q/A",
      isAmendment: true,
      filedAt: "2026-09-15",
    });

    const rows = selectFilings([original, amendment], "10-Q");
    expect(rows[0].accession).toBe("amend");
    /* The original is kept, not dropped — it is what was originally filed. */
    expect(rows).toHaveLength(2);
  });

  it("finds an earnings 8-K by item number, not by text", () => {
    /* Item 2.02 is a structured field the registrant set. Searching filing
       text for "earnings" matches a dozen unrelated 8-Ks. */
    const report = filing();
    const earnings8k = filing({
      accession: "8k-earn",
      form: "8-K",
      formKind: "8-K",
      items: ["2.02", "9.01"],
      filedAt: "2026-08-26",
      periodEnd: null,
    });
    const other8k = filing({
      accession: "8k-other",
      form: "8-K",
      formKind: "8-K",
      items: ["5.02"],
      filedAt: "2026-08-28",
      periodEnd: null,
    });

    const found = findEarningsFilings([report, other8k, earnings8k]);
    expect(found.periodicReport?.accession).toBe(report.accession);
    expect(found.announcement?.accession).toBe("8k-earn");
    expect(found.periodEnd).toBe("2026-07-26");
  });

  it("does not pair an announcement with a period it cannot belong to", () => {
    /* An 8-K filed two years after the quarter is not that quarter's
       announcement, however recent it is. */
    const report = filing({ periodEnd: "2026-07-26" });
    const stale8k = filing({
      accession: "8k-stale",
      form: "8-K",
      formKind: "8-K",
      items: ["2.02"],
      filedAt: "2024-01-01",
      periodEnd: null,
    });

    expect(findEarningsFilings([report, stale8k]).announcement).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   XBRL
--------------------------------------------------------------------------- */

/**
 * NVIDIA's real concept switch, reduced to its essentials.
 *
 * The old concept still carries quarter-shaped comparatives from 2020; the
 * new one carries the current quarter. This is the fixture that reproduces
 * the live bug.
 */
const FACTS = {
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            {
              start: "2019-10-28",
              end: "2020-01-26",
              val: 3_105_000_000,
              fy: 2020,
              fp: "FY",
              form: "10-K",
              accn: "old",
              filed: "2020-02-20",
            },
          ],
        },
      },
      Revenues: {
        units: {
          USD: [
            {
              start: "2025-04-28",
              end: "2025-07-27",
              val: 46_743_000_000,
              fy: 2026,
              fp: "Q2",
              form: "10-Q",
              accn: "prior",
              filed: "2025-08-27",
            },
            {
              start: "2026-04-27",
              end: "2026-07-26",
              val: 96_221_000_000,
              fy: 2027,
              fp: "Q2",
              form: "10-Q",
              accn: "cur",
              filed: "2026-08-26",
            },
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            {
              start: "2026-04-27",
              end: "2026-07-26",
              val: 72_142_000_000,
              fy: 2027,
              fp: "Q2",
              form: "10-Q",
              accn: "cur",
              filed: "2026-08-26",
            },
          ],
        },
      },
      Assets: {
        units: {
          USD: [
            { end: "2026-07-26", val: 200_000_000_000, fy: 2027, fp: "Q2", form: "10-Q" },
          ],
        },
      },
    },
  },
};

describe("xbrl metric resolution", () => {
  it("takes the most recent period even when a preferred concept is stale", () => {
    /* THE regression. Preference order once beat recency and returned a
       2020 figure as "latest revenue"; the gross margin computed against it
       came out at 2323%. */
    const resolved = resolveMetric(FACTS, "revenue", { period: "quarter" });

    expect(resolved?.fact.value).toBe(96_221_000_000);
    expect(resolved?.fact.concept).toBe("Revenues");
    expect(resolved?.fact.end).toBe("2026-07-26");
  });

  it("carries the concept it used, so a report can cite it", () => {
    expect(resolveMetric(FACTS, "revenue")?.fact.concept).toBe("Revenues");
  });

  it("does not return an annual figure when asked for a quarter", () => {
    /* A 10-K tags annual and quarterly facts against the same concept.
       Ignoring duration returns a year and labels it a quarter. */
    const annual = resolveMetric(FACTS, "revenue", { period: "annual" });
    expect(annual).toBeNull();
  });

  it("matches the prior year on dates, not on fiscal labels", () => {
    /* NVIDIA's Q2 FY2027 ends in July 2026. Comparing by label alone across
       a relabelled year compares the wrong quarters. */
    const current = resolveMetric(FACTS, "revenue")!;
    const prior = resolvePriorYear(FACTS, "revenue", current.fact);

    expect(prior?.fact.value).toBe(46_743_000_000);
    expect(prior?.fact.end).toBe("2025-07-27");
  });

  it("handles a balance as an instant, not a duration", () => {
    const assets = resolveMetric(FACTS, "totalAssets", { period: "quarter" });
    expect(assets?.fact.value).toBe(200_000_000_000);
    expect(assets?.fact.start).toBeNull();
  });

  it("refuses a ratio across mismatched periods", () => {
    /* The guard that would have caught the 2323% margin. */
    const revenue = resolveMetric(FACTS, "revenue")!;
    const stale = resolveMetric(FACTS, "revenue", { endingOnOrBefore: "2020-12-31" })!;

    expect(samePeriod(revenue.fact, stale.fact)).toBe(false);
    expect(samePeriod(revenue.fact, resolveMetric(FACTS, "grossProfit")!.fact)).toBe(true);
  });

  it("produces a sane margin once periods agree", () => {
    const revenue = resolveMetric(FACTS, "revenue")!;
    const gross = resolveMetric(FACTS, "grossProfit")!;
    expect(margin(gross.fact.value, revenue.fact.value)).toBeCloseTo(75.0, 1);
  });
});

/* ---------------------------------------------------------------------------
   Calculations
--------------------------------------------------------------------------- */

describe("fiscal labels", () => {
  it("labels a period from the filing whose own period it was", async () => {
    /* THE regression. `fy`/`fp` describe the FILING that reported a fact, not
       the period it covers: NVIDIA's Q2 FY2026 revenue appears tagged fy=2026
       in its own 10-Q and fy=2027 as the comparative inside the next year's.
       Reading the label off the newest occurrence — which restatement-aware
       sorting selects — labelled the prior-year column "Q2 FY2027", identical
       to the current period. */
    const { fiscalLabelFor } = await import("@/lib/research/sec/xbrl");

    const withComparative = {
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                /* As originally filed. */
                { start: "2025-04-28", end: "2025-07-27", val: 46_743_000_000, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-27" },
                /* The same quarter, restated as a comparative a year later. */
                { start: "2025-04-28", end: "2025-07-27", val: 46_743_000_000, fy: 2027, fp: "Q2", form: "10-Q", filed: "2026-08-26" },
                { start: "2026-04-27", end: "2026-07-26", val: 96_221_000_000, fy: 2027, fp: "Q2", form: "10-Q", filed: "2026-08-26" },
              ],
            },
          },
        },
      },
    };

    const current = resolveMetric(withComparative, "revenue")!;
    const prior = resolvePriorYear(withComparative, "revenue", current.fact)!;

    expect(fiscalLabelFor(withComparative, "revenue", current.fact)).toBe("Q2 FY2027");
    expect(fiscalLabelFor(withComparative, "revenue", prior.fact)).toBe("Q2 FY2026");
  });

  it("falls back to dates when no occurrence carries a label", async () => {
    const { fiscalLabelFor } = await import("@/lib/research/sec/xbrl");
    const unlabelled = {
      facts: {
        "us-gaap": {
          Revenues: {
            units: { USD: [{ start: "2026-04-27", end: "2026-07-26", val: 1, form: "10-Q" }] },
          },
        },
      },
    };
    const fact = resolveMetric(unlabelled, "revenue")!.fact;
    /* Dates are always true even when labels are absent. */
    expect(fiscalLabelFor(unlabelled, "revenue", fact)).toBe("Period ended 2026-07-26");
  });
});

describe("report verification", () => {
  it("removes a figure nothing supports", async () => {
    /* An unsourced number inside a report that carries a source appendix is
       worse than no number: the appendix implies everything was checked. */
    const { verifyReport } = await import("@/lib/research/report");

    const document = {
      id: "t", title: "T", kind: "earnings" as const,
      subject: { name: "T", ticker: "T", cik: "0000000001" },
      period: { label: "Q1", start: null, end: "2026-01-01" },
      priorPeriod: null,
      generatedAt: "2026-01-02T00:00:00.000Z",
      sections: [
        {
          id: "s", title: "Scorecard",
          blocks: [
            {
              kind: "metrics" as const,
              metrics: [
                { label: "Sourced", value: "$1", raw: 1, unit: "USD", sources: ["S1"] },
                { label: "Invented", value: "$999", raw: 999, unit: "USD", sources: [] },
                { label: "Phantom", value: "$5", raw: 5, unit: "USD", sources: ["nonexistent"] },
              ],
            },
          ],
        },
      ],
      sources: [{ id: "S1", kind: "sec_xbrl" as const, label: "x", url: null, asOf: null }],
      quality: { level: "verified" as const, checks: [], omissions: [] },
    };

    const result = verifyReport(document);
    const kept = document.sections[0].blocks[0];

    expect(kept.kind).toBe("metrics");
    if (kept.kind === "metrics") {
      expect(kept.metrics.map((m) => m.label)).toEqual(["Sourced"]);
    }
    /* A citation pointing at a source that is not in the appendix is not a
       citation. */
    expect(result.removed).toHaveLength(2);
    expect(result.level).toBe("verified_with_warnings");
  });

  it("keeps a stated absence, which needs no source", async () => {
    const { verifyReport } = await import("@/lib/research/report");
    const document = {
      id: "t", title: "T", kind: "earnings" as const,
      subject: { name: "T", ticker: null, cik: "0000000001" },
      period: { label: "Q1", start: null, end: "2026-01-01" },
      priorPeriod: null,
      generatedAt: "2026-01-02T00:00:00.000Z",
      sections: [
        {
          id: "s", title: "S",
          blocks: [
            {
              kind: "metrics" as const,
              metrics: [
                { label: "Not tagged", value: "—", raw: null, unit: null, sources: [], note: "Not disclosed." },
              ],
            },
          ],
        },
      ],
      sources: [{ id: "S1", kind: "sec_xbrl" as const, label: "x", url: null, asOf: null }],
      quality: { level: "verified" as const, checks: [], omissions: [] },
    };

    verifyReport(document);
    const block = document.sections[0].blocks[0];
    if (block.kind === "metrics") expect(block.metrics).toHaveLength(1);
  });

  it("marks a report with no resolved entity incomplete", async () => {
    const { verifyReport } = await import("@/lib/research/report");
    const result = verifyReport({
      id: "t", title: "T", kind: "earnings",
      subject: { name: "?", ticker: null, cik: null },
      period: null, priorPeriod: null,
      generatedAt: "2026-01-02T00:00:00.000Z",
      sections: [], sources: [],
      quality: { level: "verified", checks: [], omissions: [] },
    });
    expect(result.level).toBe("incomplete");
  });
});

describe("calculations", () => {
  it("computes growth", () => {
    expect(percentChange(96_221, 46_743)).toBeCloseTo(105.85, 1);
  });

  it("returns null rather than dividing by zero or a negative base", () => {
    /* Growth "from zero" is division by zero wearing a suit, and growth from
       a negative base inverts its own sign — a loss narrowing from -100 to
       -50 would report as -50%, which reads as a decline. */
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(-50, -100)).toBeNull();
  });

  it("reports margin changes in points, never in percent", () => {
    /* 60% to 75% is fifteen POINTS and a 25% relative rise. "Margin rose 25%"
       is the most common way a financial summary misleads. */
    expect(marginChangePoints(75, 60)).toBeCloseTo(15, 6);
  });

  it("refuses a margin on non-positive revenue", () => {
    expect(margin(100, 0)).toBeNull();
    expect(margin(100, -50)).toBeNull();
  });

  it("treats capex sign conventions consistently", () => {
    /* Some issuers report capex positive, some negative. Both are outflows. */
    expect(freeCashFlow(1000, 300)).toBe(700);
    expect(freeCashFlow(1000, -300)).toBe(700);
  });

  it("distinguishes rounding from a genuine conflict", () => {
    /* $96,221M against $96.2B is one number published at two precisions.
       Flagging it would bury the real conflicts in noise. */
    expect(agreesWithinRounding(96_221_000_000, 96_200_000_000)).toBe(true);
    expect(agreesWithinRounding(96_221_000_000, 91_000_000_000)).toBe(false);
  });

  it("never calls one source corroboration", () => {
    /* A source agreeing with itself is not a cross-check, and rendering it
       like one tells the reader a figure was verified when it was not. */
    expect(agreementOf([96_221])).toBe("single_source");
    expect(agreementOf([])).toBe("unavailable");
    expect(agreementOf([96_221, 96_221])).toBe("confirmed");
    expect(agreementOf([96_221, 96_200])).toBe("minor_rounding_difference");
    expect(agreementOf([96_221, 80_000])).toBe("conflict");
  });

  it("measures venue divergence against the midpoint", () => {
    /* Quoting against one leg makes the same divergence two numbers
       depending on which venue is named first. */
    const ab = divergenceBps(100.5, 100);
    const ba = divergenceBps(100, 100.5);
    expect(ab).toBeCloseTo(-(ba ?? 0), 6);
  });

  it("refuses a supply ratio without a supply", () => {
    expect(supplyRatio(1_000_000, null)).toBeNull();
    expect(supplyRatio(1_000_000, 0)).toBeNull();
    expect(supplyRatio(1_000_000, 100_000_000)).toBeCloseTo(1, 6);
  });
});

/* ---------------------------------------------------------------------------
   Yield, unlocks and signals
--------------------------------------------------------------------------- */

describe("yield", () => {
  it("converts the provider's APY fraction to a percentage", async () => {
    /* Kamino reports "0.0355…" meaning 3.56%. Rendering it raw shows 0.04%
       on a vault paying 4% — a hundredfold error that reads like rounding. */
    const { kaminoYield } = await import("@/lib/research/yield");
    const { clearProviderCache } = await import("@/lib/providers/http");
    clearProviderCache();

    const vaults = [
      { address: "V1", state: { name: "Deep USDC", tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } },
    ];
    const metrics = {
      result: [
        {
          kvault: "V1",
          apy: "0.0744",
          apy30d: "0.0700",
          apyFarmRewards: "0",
          apyIncentives: "0",
          /* TVL is TWO fields — a fully deployed vault shows $0 if only the
             idle side is read. */
          tokensAvailableUsd: "1000000",
          tokensInvestedUsd: "36000000",
          numberOfHolders: 600,
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new Response(JSON.stringify(String(url).includes("metrics") ? metrics : vaults)),
      ),
    );

    const result = await kaminoYield({ limit: 5 });
    vi.unstubAllGlobals();

    expect(result.data?.[0].apyPct).toBeCloseTo(7.44, 2);
    expect(result.data?.[0].tvlUsd).toBe(37_000_000);
    expect(result.data?.[0].asset).toBe("USDC");
  });

  it("excludes a vault too shallow to take a deposit", async () => {
    /* Live data contains vaults holding five dollars with one holder. Sorting
       on APY alone surfaces those at the top. */
    const { kaminoYield } = await import("@/lib/research/yield");
    const { clearProviderCache } = await import("@/lib/providers/http");
    clearProviderCache();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).includes("metrics")
              ? {
                  result: [
                    {
                      kvault: "V1",
                      apy: "9.99",
                      tokensAvailableUsd: "5",
                      tokensInvestedUsd: "0",
                      numberOfHolders: 1,
                    },
                  ],
                }
              : [{ address: "V1", state: { name: "Dust", tokenMint: "x" } }],
          ),
        ),
      ),
    );

    const result = await kaminoYield({ limit: 5 });
    vi.unstubAllGlobals();

    expect(result.data).toHaveLength(0);
  });
});

describe("unlocks", () => {
  it("reports unavailable rather than an empty schedule", async () => {
    /* An empty array reads as "no unlocks are coming", which is a claim about
       the future that nothing checked. */
    const { upcomingUnlocks, unlocksConfigured, UNLOCKS_UNAVAILABLE } = await import(
      "@/lib/research/unlocks"
    );

    expect(unlocksConfigured()).toBe(false);
    const result = await upcomingUnlocks(168);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(UNLOCKS_UNAVAILABLE).toMatch(/not configured/i);
    /* The reason names the fix and states the policy. */
    expect(UNLOCKS_UNAVAILABLE).toMatch(/does not scrape/i);
  });

  it("defines major deterministically, as a share of float", async () => {
    const { isMajor, unlockAttention, summariseUnlocks } = await import(
      "@/lib/research/unlocks"
    );

    const unlock = (pct: number | null, at: string) => ({
      token: "TKN", unlockAt: at, eventType: "cliff" as const,
      tokenAmount: null, valueUsd: null, percentOfCirculating: pct,
      percentOfTotal: null, allocation: null, estimated: false,
      provider: "test", sourceUrl: null, asOf: at,
    });

    expect(isMajor(unlock(1.5, "2026-10-01T00:00:00Z"))).toBe(true);
    expect(isMajor(unlock(0.4, "2026-10-01T00:00:00Z"))).toBe(false);

    /* Attention, never direction. The data cannot support "expect a dump". */
    expect(unlockAttention(unlock(6, "2026-10-01T00:00:00Z"))).toBe("high");
    expect(unlockAttention(unlock(0.1, "2026-10-01T00:00:00Z"))).toBe("low");

    const now = Date.parse("2026-09-16T00:00:00Z");
    const summary = summariseUnlocks(
      [unlock(2, "2026-09-16T12:00:00Z"), unlock(1, "2026-10-10T00:00:00Z")],
      now,
    );
    expect(summary.within24h).toBe(1);
    expect(summary.within30d).toBe(2);
    /* Unpriced is not worthless. */
    expect(summary.totalValueUsd).toBeNull();
  });
});

describe("reportRequest", () => {
  it("makes a bare ticker an earnings report and keeps a question's intent", () => {
    expect(reportRequest("NVDA", "auto")).toBe("NVDA latest earnings");
    expect(reportRequest("NVDA 10-Q", "auto")).toBe("NVDA 10-Q");
    expect(reportRequest(" MSFT ", "10-K")).toBe("MSFT 10-K");
  });
});
