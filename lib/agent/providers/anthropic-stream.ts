/* ---------------------------------------------------------------------------
   Anthropic's streamed Messages response, put back together.

   The stream is server-sent events: `message_start`, then for each content
   block a `content_block_start`, its deltas and a `content_block_stop`, then
   `message_delta` with the stop reason and `message_stop`. This rebuilds the
   same content array a non-streamed call returns — text, tool calls, and the
   thinking blocks with their signatures — so a tool continuation can send
   the assistant turn back exactly as it was produced.

   Only text is surfaced as it arrives. Thinking is never shown, and a tool
   call's arguments are parsed once its block closes, because partial JSON is
   not a value anything should act on.

   No `server-only` and no I/O: it is fed strings, so it is tested directly.
--------------------------------------------------------------------------- */

export interface SseEvent {
  event: string | null;
  data: string;
}

/**
 * Splits a buffer into complete events and the incomplete remainder.
 * Events end at a blank line; a chunk boundary can fall anywhere.
 */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, "\n");
  const parts = normalised.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];

  for (const part of parts) {
    let event: string | null = null;
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }

  return { events, rest };
}

export type ContentBlock = Record<string, unknown> & { type: string };

export interface StreamOutcome {
  blocks: ContentBlock[];
  model: string | null;
  stopReason: string | null;
  stopDetails: { category?: string | null } | null;
  usage: { input: number; output: number };
}

/** A mid-stream `error` event, with the API's own error type. */
export class StreamError extends Error {
  readonly type: string;
  constructor(type: string, message: string) {
    super(message);
    this.name = "StreamError";
    this.type = type;
  }
}

export class MessageAccumulator {
  private readonly blocks: ContentBlock[] = [];
  /** Raw `partial_json` per tool block, parsed at its stop. */
  private readonly partialJson = new Map<number, string>();
  private model: string | null = null;
  private stopReason: string | null = null;
  private stopDetails: { category?: string | null } | null = null;
  private usage = { input: 0, output: 0 };

  constructor(private readonly onText?: (delta: string) => void) {}

  /** Applies one event's data. Throws `StreamError` on an `error` event. */
  apply(data: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (payload.type) {
      case "message_start": {
        const message = payload.message as
          | { model?: string; usage?: { input_tokens?: number; output_tokens?: number } }
          | undefined;
        this.model = message?.model ?? null;
        this.usage.input = message?.usage?.input_tokens ?? 0;
        this.usage.output = message?.usage?.output_tokens ?? 0;
        return;
      }
      case "content_block_start": {
        const index = payload.index as number;
        const block = { ...(payload.content_block as ContentBlock) };
        /* A tool_use block opens with `input: {}` and fills from deltas. */
        if (block.type === "tool_use") this.partialJson.set(index, "");
        this.blocks[index] = block;
        return;
      }
      case "content_block_delta": {
        const index = payload.index as number;
        const block = this.blocks[index];
        const delta = payload.delta as Record<string, unknown> | undefined;
        if (!block || !delta) return;
        switch (delta.type) {
          case "text_delta": {
            const text = String(delta.text ?? "");
            block.text = String(block.text ?? "") + text;
            if (text.length > 0) this.onText?.(text);
            return;
          }
          case "input_json_delta":
            this.partialJson.set(index, (this.partialJson.get(index) ?? "") + String(delta.partial_json ?? ""));
            return;
          case "thinking_delta":
            block.thinking = String(block.thinking ?? "") + String(delta.thinking ?? "");
            return;
          case "signature_delta":
            block.signature = String(block.signature ?? "") + String(delta.signature ?? "");
            return;
          case "citations_delta": {
            const list = Array.isArray(block.citations) ? (block.citations as unknown[]) : [];
            list.push(delta.citation);
            block.citations = list;
            return;
          }
          default:
            return;
        }
      }
      case "content_block_stop": {
        const index = payload.index as number;
        const block = this.blocks[index];
        if (block?.type === "tool_use") {
          const raw = this.partialJson.get(index) ?? "";
          let input: unknown = {};
          if (raw.trim().length > 0) {
            try {
              input = JSON.parse(raw);
            } catch {
              /* A truncated argument object is not run: the loop sees an
                 empty input and the tool's own validation answers. */
              input = {};
            }
          }
          block.input = input !== null && typeof input === "object" ? input : {};
          this.partialJson.delete(index);
        }
        return;
      }
      case "message_delta": {
        const delta = payload.delta as { stop_reason?: string | null; stop_details?: { category?: string | null } | null };
        const usage = payload.usage as { output_tokens?: number; input_tokens?: number } | undefined;
        this.stopReason = delta?.stop_reason ?? this.stopReason;
        this.stopDetails = delta?.stop_details ?? this.stopDetails;
        if (typeof usage?.output_tokens === "number") this.usage.output = usage.output_tokens;
        if (typeof usage?.input_tokens === "number" && usage.input_tokens > 0) this.usage.input = usage.input_tokens;
        return;
      }
      case "error": {
        const error = payload.error as { type?: string; message?: string } | undefined;
        throw new StreamError(error?.type ?? "api_error", error?.message ?? "The stream failed.");
      }
      default:
        return;
    }
  }

  outcome(): StreamOutcome {
    return {
      blocks: this.blocks.filter((block): block is ContentBlock => block !== undefined),
      model: this.model,
      stopReason: this.stopReason,
      stopDetails: this.stopDetails,
      usage: { ...this.usage },
    };
  }
}
