import { describe, expect, it } from "vitest";
import {
  buildBoard,
  clusters,
  eventFlag,
  insiderMoves,
  plannedSaleFrom,
  stakeFrom,
  type DocMeta,
  type InsiderMove,
} from "@/lib/research/sec/alpha-build";
import type { Form4 } from "@/lib/research/sec/parse";

const meta = (overrides: Partial<DocMeta> = {}): DocMeta => ({
  accession: "a1",
  cik: "0000000001",
  company: "Acme Corp",
  ticker: "ACME",
  filedAt: "2026-10-15T10:00:00-04:00",
  url: "https://sec/a1",
  ...overrides,
});

const form4 = (overrides: Partial<Form4> = {}): Form4 => ({
  issuerCik: "0000000001",
  issuerName: "Acme Corp",
  ticker: "ACME",
  owners: [{ name: "Jane Doe", director: false, officer: true, tenPercent: false, title: "Chief Executive Officer" }],
  planned: false,
  transactions: [
    { code: "P", shares: 1000, price: 10, acquired: true, date: "2026-10-13", ownedAfter: 5000, security: "Common" },
    { code: "P", shares: 1000, price: 12, acquired: true, date: "2026-10-14", ownedAfter: 6000, security: "Common" },
  ],
  ...overrides,
});

describe("insiderMoves", () => {
  it("sums a purchase, prices it and sizes it against the stake before", () => {
    const [buy] = insiderMoves(form4(), meta());
    expect(buy).toMatchObject({ kind: "buy", role: "CEO", shares: 2000, value: 22000, avgPrice: 11, ownedAfter: 6000, tradeDate: "2026-10-14" });
    /* 6000 after, 2000 bought: the stake grew from 4000 by half. */
    expect(buy.changePct).toBeCloseTo(50, 6);
    expect(buy.newPosition).toBe(false);
  });

  it("marks a first purchase, a sale to zero and a scheduled sale", () => {
    const [first] = insiderMoves(
      form4({ transactions: [{ code: "P", shares: 500, price: 4, acquired: true, date: null, ownedAfter: 500, security: null }] }),
      meta(),
    );
    expect(first.newPosition).toBe(true);
    const [sale] = insiderMoves(
      form4({ planned: true, transactions: [{ code: "S", shares: 300, price: 20, acquired: false, date: null, ownedAfter: 0, security: null }] }),
      meta(),
    );
    expect(sale).toMatchObject({ kind: "sell", soldAll: true, planned: true, value: 6000 });
    expect(sale.changePct).toBeCloseTo(-100, 6);
  });

  it("ignores grants, exercises and tax withholding", () => {
    expect(
      insiderMoves(
        form4({ transactions: [{ code: "A", shares: 900, price: 0, acquired: true, date: null, ownedAfter: 900, security: null }] }),
        meta(),
      ),
    ).toEqual([]);
  });
});

describe("clusters", () => {
  const buy = (insider: string, cik: string, value: number): InsiderMove => ({
    ...meta({ cik, accession: `${insider}${cik}` }),
    kind: "buy",
    insider,
    role: "Director",
    shares: 1,
    value,
    avgPrice: null,
    ownedAfter: null,
    changePct: null,
    newPosition: false,
    soldAll: false,
    planned: false,
    tradeDate: null,
  });

  it("needs two different insiders at the same company", () => {
    const found = clusters([buy("A", "1", 100), buy("B", "1", 200), buy("C", "2", 900), buy("C", "2", 50)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ cik: "1", value: 300 });
    expect(found[0].insiders.map((entry) => entry.name)).toEqual(["A", "B"]);
  });
});

describe("events, stakes and sales", () => {
  it("keeps leadership changes apart from red flags", () => {
    const people = eventFlag({ form: "8-K", items: [{ code: "5.02", label: "" }] }, meta())!;
    const flag = eventFlag({ form: "8-K", items: [{ code: "3.01", label: "" }] }, meta())!;
    const board = buildBoard({ moves: [], stakes: [], sales: [], events: [people, flag], ipos: [] });
    expect(board.redFlags.map((event) => event.headline)).toEqual(["Notice of a failed listing rule or delisting"]);
    expect(board.leadership).toHaveLength(1);
  });

  it("leads with the most serious 8-K item and skips routine ones", () => {
    expect(
      eventFlag({ form: "8-K", items: [{ code: "2.02", label: "" }, { code: "4.02", label: "" }] }, meta())?.severity,
    ).toBe("critical");
    expect(eventFlag({ form: "8-K", items: [{ code: "7.01", label: "" }, { code: "8.01", label: "" }] }, meta())).toBeNull();
  });

  it("takes the largest holder of a 13D and keeps its purpose", () => {
    const stake = stakeFrom(
      {
        form: "SCHEDULE 13D",
        issuerCik: "1",
        issuerName: "Acme",
        eventDate: null,
        purpose: "Believes the shares are undervalued.",
        holders: [
          { name: "Fund LP", percent: 5.9, shares: 10, type: "PN" },
          { name: "Adviser LLC", percent: 6.8, shares: 12, type: "IA" },
        ],
      },
      meta(),
    );
    expect(stake).toMatchObject({ holder: "Adviser LLC", holderType: "Investment adviser", percent: 6.8, others: 1, amended: false });
  });

  it("sizes a planned sale against the shares outstanding", () => {
    const sale = plannedSaleFrom(
      { issuerCik: "1", issuerName: "Acme", seller: "VC LP", relationship: "Affiliate", units: 1_558_858, value: 36_664_000, outstanding: 69_392_766, saleDate: "2026-10-14", acquiredHow: null },
      meta(),
    );
    expect(sale?.pctOutstanding).toBeCloseTo(2.246, 2);
  });
});

describe("buildBoard", () => {
  it("ranks each board and totals the summary", () => {
    const [small] = insiderMoves(form4({ transactions: [{ code: "P", shares: 10, price: 1, acquired: true, date: null, ownedAfter: 20, security: null }] }), meta({ accession: "s" }));
    const [large] = insiderMoves(form4(), meta({ accession: "l" }));
    const board = buildBoard({ moves: [small, large], stakes: [], sales: [], events: [], ipos: [] });
    expect(board.buys.map((move) => move.accession)).toEqual(["l", "s"]);
    expect(board.summary).toMatchObject({ insiderBuys: 2, buyValue: 22010, clusters: 0 });
  });
});
