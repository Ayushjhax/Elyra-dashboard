import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blocks,
  companyName,
  filerName,
  personName,
  cleanPurpose,
  holderType,
  isoDate,
  parseForm144,
  parseForm4,
  parseSchedule13,
  roleOf,
  splitSentences,
  text,
  xmlFromSubmission,
} from "@/lib/research/sec/parse";

/* Real filings from EDGAR (October 2026), saved as they were filed. */
const fixture = (name: string) => readFileSync(`lib/research/sec/__fixtures__/${name}`, "utf8");

describe("extractors", () => {
  it("reads a value wrapped in <value>, a namespaced tag, and decodes entities", () => {
    const xml = `<a><ns1:price><value>12.50</value></ns1:price><name>Smith &amp; Co</name><empty></empty></a>`;
    expect(text(xml, "price")).toBe("12.50");
    expect(text(xml, "name")).toBe("Smith & Co");
    expect(text(xml, "empty")).toBeNull();
    expect(text(xml, "missing")).toBeNull();
    expect(blocks(`<r><x>1</x><x>2</x></r>`, "x")).toEqual(["1", "2"]);
  });

  it("finds the XML document inside a full submission", () => {
    expect(xmlFromSubmission(`<SEC-DOCUMENT>header\n<XML>\n<doc/>\n</XML>\n</SEC-DOCUMENT>`)).toBe("<doc/>");
    expect(xmlFromSubmission("no xml here")).toBeNull();
  });

  it("normalises both date styles EDGAR uses", () => {
    expect(isoDate("10/14/2026")).toBe("2026-10-14");
    expect(isoDate("2026-10-09")).toBe("2026-10-09");
    expect(isoDate("soon")).toBeNull();
  });
});

describe("parseForm4", () => {
  const form = parseForm4(fixture("form4-purchase.xml"))!;

  it("reads the issuer, the insider and an open-market purchase", () => {
    expect(form.ticker).toBe("ZONE");
    expect(form.owners[0].name).toBe("Hassen Tyler Lewis");
    expect(roleOf(form.owners[0])).toBe("CEO");
    const buy = form.transactions.find((transaction) => transaction.code === "P")!;
    expect(buy).toMatchObject({ shares: 750000, price: 0.1136, acquired: true, ownedAfter: 4000000 });
    expect(form.planned).toBe(false);
  });

  it("returns null for something that is not a Form 4", () => {
    expect(parseForm4("<other/>")).toBeNull();
  });

  it("names roles the way a reader says them", () => {
    const base = { name: "X", director: false, officer: true, tenPercent: false };
    expect(roleOf({ ...base, title: "President and Chief Executive Officer" })).toBe("CEO");
    expect(roleOf({ ...base, title: "EVP, Chief Financial Officer" })).toBe("CFO");
    expect(roleOf({ ...base, officer: false, director: true, title: null })).toBe("Director");
    expect(roleOf({ ...base, officer: false, tenPercent: true, title: null })).toBe("10% owner");
  });
});

describe("parseSchedule13", () => {
  const stake = parseSchedule13(fixture("schedule13d.xml"))!;

  it("reads the holders, their stake and the stated purpose", () => {
    expect(stake.form).toBe("SCHEDULE 13D");
    expect(stake.issuerName).toBe("FRANKLIN STREET PROPERTIES CORP. /MA/");
    expect(stake.holders[0]).toMatchObject({ name: "Powell Anderson Capital Partners LLC", percent: 6.8, type: "IA" });
    expect(stake.purpose).toMatch(/undervalued/);
    expect(holderType("IA")).toBe("Investment adviser");
  });

  it("drops amendment boilerplate and never cuts a sentence at Inc.", () => {
    expect(
      cleanPurpose(
        'Item 4 of the Schedule 13D is hereby amended to add the following. On May 1, the Issuer entered into a merger agreement with Ithaca Holdings Inc. ("Ithaca"). The Reporting Persons support it.',
      ),
    ).toBe('On May 1, the Issuer entered into a merger agreement with Ithaca Holdings Inc. ("Ithaca"). The Reporting Persons support it.');
    expect(splitSentences("Mr. Graham intends to sell. Nothing else.")).toEqual(["Mr. Graham intends to sell.", "Nothing else."]);
    expect(cleanPurpose("Item 4 is hereby amended and restated in its entirety.")).toBeNull();
  });
});

describe("parseForm144", () => {
  it("reads who plans to sell, how much, and when", () => {
    expect(parseForm144(fixture("form144.xml"))).toMatchObject({
      issuerName: "Alamar Biosciences, Inc.",
      seller: "Qiming Venture Partners VI, L.P.",
      units: 1558858,
      value: 36664000,
      outstanding: 69392766,
      saleDate: "2026-10-14",
    });
  });
});

describe("names", () => {
  it("sets capitalised people in title case, keeping initials and suffixes", () => {
    expect(personName("KAMFAR RAMIN")).toBe("Kamfar Ramin");
    expect(personName("MCCARTHY KENT C")).toBe("McCarthy Kent C");
    expect(personName("O'BRIEN JOHN JR.")).toBe("O'Brien John Jr.");
    expect(personName("Whitney Wolfe Herd")).toBe("Whitney Wolfe Herd");
  });

  it("keeps a company's acronyms and drops EDGAR's state tag", () => {
    expect(companyName("FRANKLIN STREET PROPERTIES CORP. /MA/")).toBe("Franklin Street Properties Corp.");
    expect(companyName("BHP GROUP LTD")).toBe("BHP Group Ltd");
    expect(companyName("CROSS TIMBERS ROYALTY TRUST")).toBe("Cross Timbers Royalty Trust");
    expect(companyName("Bumble Inc.")).toBe("Bumble Inc.");
  });

  it("tells an entity from a person", () => {
    expect(filerName("SILVER POINT CAPITAL, L.P.")).toBe("Silver Point Capital, L.P.");
    expect(filerName("NG CHUN SEONG")).toBe("Ng Chun Seong");
  });
});
