import { describe, expect, it } from "vitest";
import { MessageAccumulator, StreamError, parseSse } from "@/lib/agent/providers/anthropic-stream";

const sse = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

const STREAM = [
  sse("message_start", { message: { model: "claude-sonnet-5", usage: { input_tokens: 120, output_tokens: 1 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "Check the price." } }),
  sse("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig-abc" } }),
  sse("content_block_stop", { index: 0 }),
  sse("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 1, delta: { type: "text_delta", text: "Let me " } }),
  sse("ping", {}),
  sse("content_block_delta", { index: 1, delta: { type: "text_delta", text: "look." } }),
  sse("content_block_stop", { index: 1 }),
  sse("content_block_start", { index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "get_market_snapshot", input: {} } }),
  sse("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: '{"sym' } }),
  sse("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: 'bol": "SOL"}' } }),
  sse("content_block_stop", { index: 2 }),
  sse("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } }),
  sse("message_stop", {}),
].join("");

function run(chunks: string[], onText?: (delta: string) => void) {
  const accumulator = new MessageAccumulator(onText);
  let buffer = "";
  for (const chunk of chunks) {
    const { events, rest } = parseSse(buffer + chunk);
    buffer = rest;
    for (const event of events) accumulator.apply(event.data);
  }
  return accumulator.outcome();
}

describe("parseSse", () => {
  it("keeps an event split across chunks until it is complete", () => {
    const first = parseSse("event: ping\ndata: {\"type\":");
    expect(first.events).toEqual([]);
    const second = parseSse(first.rest + "\"ping\"}\n\nevent: x");
    expect(second.events).toEqual([{ event: "ping", data: '{"type":"ping"}' }]);
    expect(second.rest).toBe("event: x");
  });

  it("accepts CRLF line endings", () => {
    expect(parseSse("data: {}\r\n\r\n").events).toEqual([{ event: null, data: "{}" }]);
  });
});

describe("MessageAccumulator", () => {
  it("rebuilds thinking, text and tool blocks exactly, however the stream is chunked", () => {
    const whole = run([STREAM]);
    /* Byte-by-byte is the worst case for a boundary bug. */
    const bytewise = run(STREAM.split(""));
    expect(bytewise).toEqual(whole);

    expect(whole.blocks).toEqual([
      { type: "thinking", thinking: "Check the price.", signature: "sig-abc" },
      { type: "text", text: "Let me look." },
      { type: "tool_use", id: "toolu_1", name: "get_market_snapshot", input: { symbol: "SOL" } },
    ]);
    expect(whole.stopReason).toBe("tool_use");
    expect(whole.model).toBe("claude-sonnet-5");
    expect(whole.usage).toEqual({ input: 120, output: 42 });
  });

  it("surfaces text as it arrives and never the thinking", () => {
    const deltas: string[] = [];
    run([STREAM], (delta) => deltas.push(delta));
    expect(deltas).toEqual(["Let me ", "look."]);
  });

  it("does not run a tool on truncated arguments", () => {
    const truncated = [
      sse("content_block_start", { index: 0, content_block: { type: "tool_use", id: "t", name: "x", input: {} } }),
      sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: '{"symbol": "SO' } }),
      sse("content_block_stop", { index: 0 }),
    ].join("");
    expect(run([truncated]).blocks[0].input).toEqual({});
  });

  it("raises a mid-stream error with its type", () => {
    const accumulator = new MessageAccumulator();
    expect(() =>
      accumulator.apply(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })),
    ).toThrow(StreamError);
  });

  it("reports a refusal's stop reason and category", () => {
    const outcome = run([
      sse("message_delta", { delta: { stop_reason: "refusal", stop_details: { category: "cyber" } }, usage: { output_tokens: 3 } }),
    ]);
    expect(outcome.stopReason).toBe("refusal");
    expect(outcome.stopDetails).toEqual({ category: "cyber" });
  });
});
