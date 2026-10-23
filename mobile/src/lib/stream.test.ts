import { createLineSplitter, createSseParser, parseNdjsonLine } from "~/lib/stream";

describe("createLineSplitter", () => {
  it("holds a line split across chunks until it is whole", () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"type":"te')).toEqual([]);
    expect(splitter.push('xt"}\n{"type":"done"}\n{"par')).toEqual(['{"type":"text"}', '{"type":"done"}']);
    expect(splitter.flush()).toEqual(['{"par']);
  });

  it("treats CRLF like LF", () => {
    expect(createLineSplitter().push("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("parseNdjsonLine", () => {
  it("skips blank and malformed lines rather than ending the stream", () => {
    expect(parseNdjsonLine('{"type":"text","delta":"hi"}')).toEqual({ type: "text", delta: "hi" });
    expect(parseNdjsonLine("   ")).toBeUndefined();
    expect(parseNdjsonLine("{not json")).toBeUndefined();
  });
});

describe("createSseParser", () => {
  it("joins data lines, names events, ignores comments, and ends an event at a blank line", () => {
    const parser = createSseParser();
    const lines = [": keep-alive", "event: signal", "id: 7", "data: {\"a\":1}", "data: more", ""];
    const events = lines.map((line) => parser.line(line)).filter((event) => event !== null);
    expect(events).toEqual([{ event: "signal", data: '{"a":1}\nmore', id: "7" }]);
  });

  it("defaults the event name and ignores an empty event", () => {
    const parser = createSseParser();
    expect(parser.line("")).toBeNull();
    parser.line("data: x");
    expect(parser.line("")).toEqual({ event: "message", data: "x", id: null });
  });
});
