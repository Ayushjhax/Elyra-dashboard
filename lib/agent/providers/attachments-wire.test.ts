import { describe, expect, it } from "vitest";
import { toWireMessages } from "@/lib/agent/providers/anthropic";
import { toContents } from "@/lib/agent/providers/gemini";
import type { AgentMessage } from "@/lib/agent/providers/types";
import type { Attachment } from "@/lib/attachments";

const files: Attachment[] = [
  { name: "memo.pdf", mediaType: "application/pdf", data: "JVBERi0=", kind: "pdf" },
  { name: "chart.png", mediaType: "image/png", data: "iVBORw0K", kind: "image" },
  { name: "fills.csv", mediaType: "text/csv", data: "a,b\n1,2", kind: "text" },
];

describe("anthropic wire format", () => {
  it("puts images first, then documents, then the question", () => {
    const [turn] = toWireMessages([{ role: "user", content: "What changed?", attachments: files }]);
    expect(turn.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0K" } },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "memo.pdf" },
      { type: "document", source: { type: "text", media_type: "text/plain", data: "a,b\n1,2" }, title: "fills.csv" },
      { type: "text", text: "What changed?" },
    ]);
  });

  it("never sends an empty text block with files alone", () => {
    const [turn] = toWireMessages([{ role: "user", content: "  ", attachments: [files[1]] }]);
    expect((turn.content as Array<{ type: string; text?: string }>).at(-1)).toEqual({
      type: "text",
      text: "Take a look at the attached file.",
    });
  });

  it("leaves a plain message as a string", () => {
    expect(toWireMessages([{ role: "user", content: "hi" }])[0].content).toBe("hi");
  });
});

describe("gemini wire format", () => {
  it("inlines images and PDFs and names text files", () => {
    const [turn] = toContents([{ role: "user", content: "What changed?", attachments: files }]);
    expect(turn.parts).toEqual([
      { inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } },
      { inlineData: { mimeType: "image/png", data: "iVBORw0K" } },
      { text: 'Attached file "fills.csv":\n\na,b\n1,2' },
      { text: "What changed?" },
    ]);
  });

  it("sends a model turn back with its thought signature, one call per name", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "SOL and BTC?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "gemini-get_price", name: "get_price", arguments: { symbol: "SOL" } }],
        providerContent: {
          provider: "gemini",
          blocks: [
            { functionCall: { name: "get_price", args: { symbol: "SOL" } }, thoughtSignature: "sig" },
            { functionCall: { name: "get_price", args: { symbol: "BTC" } } },
          ],
        },
      },
    ];
    expect(toContents(messages)[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "get_price", args: { symbol: "SOL" } }, thoughtSignature: "sig" }],
    });
  });

  it("rebuilds a turn another provider produced", () => {
    const [, turn] = toContents([
      { role: "user", content: "x" },
      {
        role: "assistant",
        content: "Checking.",
        toolCalls: [{ id: "t", name: "get_price", arguments: {} }],
        providerContent: { provider: "anthropic", blocks: [{ type: "text", text: "Checking." }] },
      },
    ]);
    expect(turn.parts).toEqual([{ text: "Checking." }, { functionCall: { name: "get_price", args: {} } }]);
  });
});
