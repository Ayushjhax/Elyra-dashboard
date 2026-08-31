import type { JsonSchema, ToolCall } from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   The two places Gemini and Anthropic disagree about tool calling.

   No `server-only` import here: this module is pure and is exercised directly
   by unit tests against every tool in the registry.
--------------------------------------------------------------------------- */

/**
 * Schema keywords Gemini's parser accepts.
 *
 * A whitelist rather than a blacklist of the known-rejected ones. Gemini
 * rejects the whole request when it meets a keyword it does not know, so a
 * blacklist fails the moment someone adds a keyword nobody thought to ban —
 * the failure would be a 400 on every Gemini fallback, discovered only during
 * an Anthropic outage, which is the worst possible time to find it.
 */
const ALLOWED_KEYS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "minItems",
  "maxItems",
]);

/**
 * Gemini accepts `format` only from a short per-type list and 400s on
 * anything else — including perfectly ordinary JSON Schema formats like
 * "uri" and "email".
 */
const ALLOWED_FORMATS: Record<string, Set<string>> = {
  STRING: new Set(["enum", "date-time"]),
  NUMBER: new Set(["float", "double"]),
  INTEGER: new Set(["int32", "int64"]),
};

/**
 * Strips a JSON Schema down to what Gemini's parser will accept.
 *
 * Recursive: nested object properties and array item schemas go through the
 * same filter, because a rejected keyword three levels deep fails the request
 * exactly as hard as one at the top.
 */
export function sanitizeSchemaForGemini(schema: JsonSchema): JsonSchema {
  const type = String(schema.type ?? "object").toUpperCase();
  const output: JsonSchema = { type };

  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" || !ALLOWED_KEYS.has(key)) continue;

    if (key === "format") {
      const allowed = ALLOWED_FORMATS[type];
      /* Drop rather than pass through: an unsupported format is a 400, and
         the field it describes is still usable without it. */
      if (allowed?.has(String(value))) output.format = value;
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      const properties: Record<string, JsonSchema> = {};
      for (const [name, child] of Object.entries(value as Record<string, JsonSchema>)) {
        properties[name] = sanitizeSchemaForGemini(child);
      }
      output.properties = properties;
      continue;
    }

    if (key === "items" && value && typeof value === "object") {
      output.items = sanitizeSchemaForGemini(value as JsonSchema);
      continue;
    }

    output[key] = value;
  }

  /* `required` naming a property that no longer exists is itself a 400. This
     only bites if a sanitised property was dropped, but the check is cheap. */
  if (Array.isArray(output.required) && output.properties) {
    const known = new Set(Object.keys(output.properties));
    const kept = (output.required as string[]).filter((name) => known.has(name));
    if (kept.length > 0) output.required = kept;
    else delete output.required;
  }

  return output;
}

/**
 * Collapses repeated tool names within one turn.
 *
 * Gemini matches a functionResponse to its call by **name**, not by a call
 * id — the wire format has no id at all. If a turn contains two calls to the
 * same tool, there is no way to say which response belongs to which call, and
 * the second result silently overwrites the first.
 *
 * Keeping the first call of each name is the honest option: the model gets
 * one answer it can trust rather than two it cannot distinguish, and it is
 * free to ask for the rest on the next iteration. Anthropic round-trips ids
 * properly and never goes through here.
 */
export function collapseDuplicateToolCalls(calls: ToolCall[]): {
  calls: ToolCall[];
  dropped: string[];
} {
  const seen = new Set<string>();
  const kept: ToolCall[] = [];
  const dropped: string[] = [];

  for (const call of calls) {
    if (seen.has(call.name)) {
      dropped.push(call.name);
      continue;
    }
    seen.add(call.name);
    kept.push(call);
  }

  return { calls: kept, dropped };
}
