import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "@/lib/markdown";

describe("parseInline", () => {
  it("reads bold, italic, code and links", () => {
    expect(parseInline("**SOL** is *up* by `2%` — see [Solscan](https://solscan.io/tx/1)")).toEqual([
      { t: "strong", c: [{ t: "text", v: "SOL" }] },
      { t: "text", v: " is " },
      { t: "em", c: [{ t: "text", v: "up" }] },
      { t: "text", v: " by " },
      { t: "code", v: "2%" },
      { t: "text", v: " — see " },
      { t: "link", href: "https://solscan.io/tx/1", c: [{ t: "text", v: "Solscan" }] },
    ]);
  });

  it("never makes a link of anything but http(s) or mailto", () => {
    for (const input of ["[click](javascript:alert(1))", "[x](vbscript:msgbox)", "<a href=x>y</a>"]) {
      expect(parseInline(input).every((node) => node.t === "text")).toBe(true);
    }
    expect(parseInline("[x](data:text/html,hi)")).toEqual([{ t: "text", v: "x" }]);
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });

  it("links a bare URL without swallowing the sentence's full stop", () => {
    expect(parseInline("Read https://sec.gov/x.htm.")).toEqual([
      { t: "text", v: "Read " },
      { t: "link", href: "https://sec.gov/x.htm", c: [{ t: "text", v: "https://sec.gov/x.htm" }] },
      { t: "text", v: "." },
    ]);
  });

  it("leaves snake_case and a lone asterisk alone", () => {
    expect(parseInline("max_leverage is 3 * 2")).toEqual([{ t: "text", v: "max_leverage is 3 * 2" }]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings, paragraphs and both kinds of list", () => {
    const blocks = parseMarkdown("## Summary\nYou hold two assets.\nBoth are liquid.\n\n- SOL\n- USDC\n\n3. First\n4. Second");
    expect(blocks.map((block) => block.t)).toEqual(["h", "p", "ul", "ol"]);
    expect(blocks[1]).toEqual({ t: "p", c: [{ t: "text", v: "You hold two assets.\nBoth are liquid." }] });
    expect(blocks[3]).toMatchObject({ t: "ol", start: 3 });
  });

  it("reads a table with its alignment and an escaped pipe", () => {
    const [table] = parseMarkdown("| Asset | Value |\n|:--|--:|\n| SOL | $662.89 |\n| a\\|b | |");
    expect(table).toMatchObject({ t: "table", align: ["left", "right"] });
    if (table.t !== "table") throw new Error("not a table");
    expect(table.rows[1][0]).toEqual([{ t: "text", v: "a|b" }]);
    expect(table.rows[1][1]).toEqual([]);
  });

  it("keeps a fenced block verbatim, Markdown and all", () => {
    expect(parseMarkdown("```ts\nconst a = **1**;\n```")).toEqual([{ t: "code", lang: "ts", v: "const a = **1**;" }]);
  });

  it("nests blocks inside a quote and reads a rule", () => {
    const blocks = parseMarkdown("> **Note**\n> - one\n\n---");
    expect(blocks[0]).toMatchObject({ t: "quote", c: [{ t: "p" }, { t: "ul" }] });
    expect(blocks[1]).toEqual({ t: "hr" });
  });
});
