/* ---------------------------------------------------------------------------
   Reading a streamed response a line at a time.

   The API streams two shapes: newline-delimited JSON (the agent's replies,
   one event per line) and Server-Sent Events (the tracker feed). Both arrive
   as arbitrary byte chunks that split lines anywhere, so the splitting is
   here — pure, and tested — and the network part in lib/api.ts only feeds it.

   A malformed line is skipped rather than ending the stream, as the website's
   reader does: one bad event must not cost the rest of an answer.
--------------------------------------------------------------------------- */

/** Splits text into complete lines, holding back a trailing partial one. */
export function createLineSplitter() {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      return lines;
    },
    /** Whatever is left once the stream ends. */
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      return rest.trim().length > 0 ? [rest] : [];
    },
  };
}

/** One NDJSON line as a value, or undefined for a blank or malformed one. */
export function parseNdjsonLine(line: string): unknown {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export interface SseEvent {
  event: string;
  data: string;
  id: string | null;
}

/**
 * Collects SSE fields into events. An event ends at a blank line; `data`
 * lines join with newlines; comments (":…") are ignored.
 */
export function createSseParser() {
  let event = "message";
  let data: string[] = [];
  let id: string | null = null;
  return {
    line(raw: string): SseEvent | null {
      if (raw === "") {
        if (data.length === 0) {
          event = "message";
          return null;
        }
        const done: SseEvent = { event, data: data.join("\n"), id };
        event = "message";
        data = [];
        return done;
      }
      if (raw.startsWith(":")) return null;
      const colon = raw.indexOf(":");
      const field = colon === -1 ? raw : raw.slice(0, colon);
      const value = colon === -1 ? "" : raw.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
      return null;
    },
  };
}
