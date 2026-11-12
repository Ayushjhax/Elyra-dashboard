import { describe, expect, it } from "vitest";
import {
  TELEGRAM_CHUNK_LIMIT,
  chunkForTelegram,
  escapeHtml,
  formatForTelegram,
  markdownToTelegramHtml,
} from "@/lib/agent/format/telegram";

const html = markdownToTelegramHtml;

/** Every tag Telegram's parser accepts. Anything else is a 400. */
const ALLOWED_TAGS = new Set(["b", "i", "u", "s", "code", "pre", "a"]);

function tagsIn(text: string): string[] {
  return [...text.matchAll(/<\/?(\w+)/g)].map((match) => match[1]);
}

/** Whether every tag in the string is opened and closed in order. */
function balanced(text: string): boolean {
  const stack: string[] = [];
  for (const match of text.matchAll(/<(\/?)(\w+)(?:\s[^>]*)?>/g)) {
    if (match[1] === "/") {
      if (stack.pop() !== match[2]) return false;
    } else {
      stack.push(match[2]);
    }
  }
  return stack.length === 0;
}

describe("escapeHtml", () => {
  it("escapes the three characters Telegram's parser reads as markup", () => {
    expect(escapeHtml('a < b & c > d "e"')).toBe("a &lt; b &amp; c &gt; d \"e\"");
  });

  it("escapes the ampersand first, so entities are not double-escaped", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("inline formatting", () => {
  it("converts bold, italic and strikethrough", () => {
    expect(html("**bold**")).toBe("<b>bold</b>");
    expect(html("__also bold__")).toBe("<b>also bold</b>");
    expect(html("*italic*")).toBe("<i>italic</i>");
    expect(html("~~gone~~")).toBe("<s>gone</s>");
  });

  it("handles ** before *, so double markers do not nest wrongly", () => {
    expect(html("**SOL** is *up*")).toBe("<b>SOL</b> is <i>up</i>");
  });

  it("leaves snake_case alone", () => {
    /* This app's own tool names are snake_case and appear in replies. */
    expect(html("call get_market_snapshot now")).toBe(
      "call get_market_snapshot now",
    );
  });

  it("keeps emphasis markers inside code literal", () => {
    expect(html("`a * b * c`")).toBe("<code>a * b * c</code>");
  });

  it("escapes inside code spans", () => {
    expect(html("`a < b && c`")).toBe("<code>a &lt; b &amp;&amp; c</code>");
  });

  it("converts links and escapes the href", () => {
    expect(html("[Binance](https://binance.com/a?b=1&c=2)")).toBe(
      '<a href="https://binance.com/a?b=1&amp;c=2">Binance</a>',
    );
  });

  it("never hides where a link goes unless Elyra itself links there", () => {
    /* A reply carrying an injected phishing link must show its destination. */
    expect(html("[Open your Elyra wallet](https://elyra-claim.example/drop)")).toBe(
      "Open your Elyra wallet (https://elyra-claim.example/drop)",
    );
    /* A lookalike that merely starts with a trusted name is not that name. */
    expect(html("[Solscan](https://solscan.io.evil.example/tx)")).toBe("Solscan (https://solscan.io.evil.example/tx)");
    /* Plain http, credentials in the URL and tg:// deep links are never links. */
    expect(html("[x](http://solscan.io/tx)")).toBe("x (http://solscan.io/tx)");
    expect(html("[x](https://user:pw@solscan.io/tx)")).toBe("x (https://user:pw@solscan.io/tx)");
    expect(html("[join](tg://join?invite=abc)")).toBe("[join](tg://join?invite=abc)");
    /* A subdomain of a listed host still links. */
    expect(html("[app](https://app.hyperliquid.xyz/trade)")).toBe('<a href="https://app.hyperliquid.xyz/trade">app</a>');
  });

  it("does not linkify a javascript: url", () => {
    /* Emitted as text rather than handed to a Telegram client. */
    const result = html("[click](javascript:alert(1))");
    expect(result).not.toContain("<a");
    expect(result).toContain("javascript:alert(1)");
  });

  it("does not read underscores in a url as italics", () => {
    expect(html("[x](https://solscan.io/a_b_c)")).toBe(
      '<a href="https://solscan.io/a_b_c">x</a>',
    );
  });
});

describe("block structure", () => {
  it("turns headings into bold, since Telegram has none", () => {
    expect(html("## Funding")).toBe("<b>Funding</b>");
  });

  it("turns bullets into a bullet character", () => {
    expect(html("- one\n- two")).toBe("• one\n• two");
  });

  it("keeps numbered lists numbered", () => {
    expect(html("1. one\n2. two")).toBe("1. one\n2. two");
  });

  it("preserves fenced code as a pre block", () => {
    expect(html("```\na < b\n```")).toBe("<pre>a &lt; b</pre>");
  });

  it("keeps the language on a fenced block", () => {
    expect(html("```ts\nconst a = 1;\n```")).toBe(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
    );
  });

  it("does not format markdown inside a code fence", () => {
    expect(html("```\n**not bold**\n```")).toBe("<pre>**not bold**</pre>");
  });
});

describe("tables", () => {
  const table = [
    "| Symbol | Funding | OI |",
    "|--------|---------|-----|",
    "| SOL | +0.0092% | $412.8M |",
    "| BTC | -0.0031% | $8.1B |",
  ].join("\n");

  it("strips the table entirely — Telegram renders none", () => {
    const result = html(table);
    expect(result).not.toContain("|");
    expect(result).not.toContain("---");
  });

  it("converts rows to labelled lines keyed on the first column", () => {
    const result = html(table);
    expect(result).toContain("<b>SOL</b>");
    expect(result).toContain("Funding: +0.0092%");
    expect(result).toContain("OI: $412.8M");
    expect(result).toContain("<b>BTC</b>");
  });

  it("produces only tags Telegram accepts", () => {
    for (const tag of tagsIn(html(table))) {
      expect(ALLOWED_TAGS.has(tag)).toBe(true);
    }
  });
});

describe("chunking", () => {
  it("returns a single chunk when it fits", () => {
    expect(chunkForTelegram("short")).toEqual(["short"]);
  });

  it("returns nothing for empty input", () => {
    expect(chunkForTelegram("   ")).toEqual([]);
  });

  it("splits on paragraph boundaries", () => {
    const paragraph = "x".repeat(300);
    const chunks = chunkForTelegram(
      Array.from({ length: 10 }, () => paragraph).join("\n\n"),
      1000,
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000);
    /* Nothing lost: every paragraph survives somewhere. */
    expect(chunks.join("").replace(/\n/g, "")).toHaveLength(3000);
  });

  it("never splits inside a tag", () => {
    const source = Array.from(
      { length: 200 },
      (_, i) => `**bold ${i}** and *italic ${i}* text`,
    ).join("\n\n");

    for (const chunk of formatForTelegram(source, 500)) {
      expect(chunk.length).toBeLessThanOrEqual(500);
      expect(balanced(chunk), `unbalanced: ${chunk.slice(0, 120)}`).toBe(true);
      expect(chunk).not.toMatch(/<[a-z]*$/i);
    }
  });

  it("closes and reopens tags when one oversized block must be split", () => {
    /* A single paragraph longer than the limit, entirely inside one tag. */
    const chunks = chunkForTelegram(`<b>${"word ".repeat(400)}</b>`, 500);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(560);
      expect(balanced(chunk), `unbalanced: ${chunk.slice(0, 120)}`).toBe(true);
    }
  });

  it("does not split an html entity in half", () => {
    const chunks = chunkForTelegram(`${"a".repeat(495)}&amp;${"b".repeat(500)}`, 500);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/&[a-z]{0,8}$/i);
    }
  });

  it("keeps every chunk under Telegram's real limit by default", () => {
    const long = Array.from(
      { length: 400 },
      (_, i) => `Paragraph ${i} with some **bold** content in it.`,
    ).join("\n\n");

    for (const chunk of formatForTelegram(long)) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_CHUNK_LIMIT);
    }
  });
});

describe("a realistic agent reply", () => {
  const reply = `## SOL — 4H

SOL is trading at **$184.26**, up *2.41%* over 24h. It reclaimed the range
high at 181.40 earlier today.

| Metric | Value |
|---|---|
| RSI 14 | 61.2 |
| Funding | +0.0092% |

- Volume ran 1.7x its 20-period average
- Open interest flat over the window

Funding history came from \`get_funding_rate\`. See [Binance](https://binance.com/x?a=1&b=2).`;

  it("emits only tags Telegram accepts", () => {
    for (const tag of tagsIn(html(reply))) {
      expect(ALLOWED_TAGS.has(tag), `unexpected <${tag}>`).toBe(true);
    }
  });

  it("is balanced and has no leftover markdown", () => {
    const result = html(reply);
    expect(balanced(result)).toBe(true);
    expect(result).not.toContain("|");
    expect(result).not.toContain("##");
    expect(result).not.toContain("**");
  });

  it("escapes the ampersand in the link href", () => {
    expect(html(reply)).toContain("a=1&amp;b=2");
  });

  it("fits in one chunk", () => {
    expect(formatForTelegram(reply)).toHaveLength(1);
  });
});
