import { describe, expect, it } from "vitest";
import { columnName, crc32, escapeXml, sheetName, workbook, zip } from "@/lib/portfolio/xlsx";

/* ---------------------------------------------------------------------------
   The export's workbook: a valid stored zip, and cells that cannot break the
   XML around them.
--------------------------------------------------------------------------- */

const decoder = new TextDecoder();

/** The entries of a stored zip, read back from its central directory. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const localName = view.getUint16(offset + 26, true);
    const data = bytes.subarray(offset + 30 + localName, offset + 30 + localName + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("zip", () => {
  it("round-trips its entries with matching checksums", () => {
    const files = readZip(zip([{ path: "a.txt", data: new TextEncoder().encode("héllo") }, { path: "b/c.xml", data: new TextEncoder().encode("<x/>") }]));
    expect([...files.entries()]).toEqual([
      ["a.txt", "héllo"],
      ["b/c.xml", "<x/>"],
    ]);
  });
});

describe("workbook", () => {
  const bytes = workbook([
    { name: "Performance", rows: [["Day", "PnL"], ["2026-11-24", 1000.5], ["2026-11-25", null]] },
    { name: "Positions: <all>", rows: [["Market"], ['Will "BTC" & ETH < $1?']] },
  ]);
  const files = readZip(bytes);

  it("holds the parts a spreadsheet app needs, one sheet per table", () => {
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
  });

  it("writes numbers as numbers, so a column sums", () => {
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<c r="B2"><v>1000.5</v></c>');
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<c r="B3"/>');
  });

  it("escapes text, and names sheets as Excel allows", () => {
    expect(files.get("xl/worksheets/sheet2.xml")).toContain("Will &quot;BTC&quot; &amp; ETH &lt; $1?");
    expect(files.get("xl/workbook.xml")).toContain('name="Positions  &lt;all&gt;"');
  });
});

describe("helpers", () => {
  it("names columns past Z", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(701), columnName(702)]).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });

  it("keeps sheet names short, legal and unique", () => {
    const taken = new Set<string>();
    expect(sheetName("A/B", taken)).toBe("A B");
    expect(sheetName("a b", taken)).toBe("a b 2");
    expect(sheetName("x".repeat(40), taken)).toHaveLength(31);
  });

  it("drops characters XML cannot hold", () => {
    expect(escapeXml("a\u0001b")).toBe("ab");
  });
});
