import { describe, expect, it } from "vitest";
import { parseCurrentFeed, toFilings } from "@/lib/research/sec/current";
import { inCategory, formLabel } from "@/lib/research/sec/forms";

/* Shaped exactly as EDGAR's getcurrent Atom feed returns it (October 2026). */
const entry = (title: string, accession: string, updated: string, summary = "") => `<entry>
<title>${title}</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1/${accession.replace(/-/g, "")}/${accession}-index.htm"/>
<summary type="html">
 &lt;b&gt;Filed:&lt;/b&gt; 2026-10-14 &lt;b&gt;AccNo:&lt;/b&gt; ${accession} &lt;b&gt;Size:&lt;/b&gt; 9 KB${summary}
</summary>
<updated>${updated}</updated>
<category scheme="https://www.sec.gov/" label="form type" term="x"/>
<id>urn:tag:sec.gov,2008:accession-number=${accession}</id>
</entry>`;

const FEED = `<?xml version="1.0" encoding="ISO-8859-1" ?><feed xmlns="http://www.w3.org/2005/Atom">
${entry("4 - Kim Vyacheslav (0002029485) (Reporting)", "0001-26-000001", "2026-10-14T06:06:02-04:00")}
${entry("4 - Joint Stock Co Kaspi.kz (0001985487) (Issuer)", "0001-26-000001", "2026-10-14T06:06:02-04:00")}
${entry("8-K - ENERGY FUELS INC (0001385849) (Filer)", "0002-26-000002", "2026-10-13T17:36:30-04:00", "\n&lt;br&gt;Item 2.02: Results of Operations and Financial Condition\n&lt;br&gt;Item 9.01: Financial Statements and Exhibits")}
${entry("SCHEDULE 13D/A - Big Holder LP (0000000042) (Filed by)", "0003-26-000003", "2026-10-14T05:00:00-04:00")}
${entry("SCHEDULE 13D/A - Target &amp; Co (0000000043) (Subject)", "0003-26-000003", "2026-10-14T05:00:00-04:00")}
${entry("4 - Orphan Insider (0000000099) (Reporting)", "0004-26-000004", "2026-10-14T04:00:00-04:00")}
</feed>`;

describe("parseCurrentFeed", () => {
  it("reads form, filer, role, accession, time and 8-K items", () => {
    const entries = parseCurrentFeed(FEED);
    expect(entries).toHaveLength(6);
    expect(entries[2]).toMatchObject({
      form: "8-K",
      name: "ENERGY FUELS INC",
      cik: "0001385849",
      role: "Filer",
      items: ["2.02", "9.01"],
    });
    expect(entries[4].name).toBe("Target & Co");
  });
});

describe("toFilings", () => {
  const tickers = new Map([
    ["0001385849", { ticker: "UUUU" }],
    ["0001985487", { ticker: "KSPI" }],
  ]);
  const filings = toFilings(parseCurrentFeed(FEED), tickers);

  it("joins an insider to the company, and a holder to its target", () => {
    const insider = filings.find((filing) => filing.form === "4");
    expect(insider).toMatchObject({ company: "Joint Stock Co Kaspi.kz", ticker: "KSPI", filer: "Kim Vyacheslav" });
    const stake = filings.find((filing) => filing.form === "SCHEDULE 13D/A");
    expect(stake).toMatchObject({ company: "Target & Co", ticker: null, filer: "Big Holder LP", label: "Activist 5%+ stake, amended" });
  });

  it("never shows an insider as if they were the company", () => {
    expect(filings.some((filing) => filing.company === "Orphan Insider")).toBe(false);
  });

  it("labels 8-K items and drops the exhibits item", () => {
    const event = filings.find((filing) => filing.form === "8-K");
    expect(event?.items).toEqual([{ code: "2.02", label: "Results of operations" }]);
  });

  it("orders newest first", () => {
    expect(filings.map((filing) => filing.form)).toEqual(["4", "SCHEDULE 13D/A", "8-K"]);
  });
});

describe("forms", () => {
  it("files old and new 13D names, and amendments, under the same category", () => {
    expect(inCategory("SC 13G/A", "ownership")).toBe(true);
    expect(inCategory("SCHEDULE 13D", "ownership")).toBe(true);
    expect(inCategory("10-KT", "reports")).toBe(true);
    expect(inCategory("424B2", "insiders")).toBe(false);
  });

  it("names a form it does not know by its own name", () => {
    expect(formLabel("N-CSR")).toBe("N-CSR");
    expect(formLabel("8-K/A")).toBe("Material event, amended");
  });
});
