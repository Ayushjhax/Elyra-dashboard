import { describe, expect, it } from "vitest";
import {
  collapseDuplicateToolCalls,
  sanitizeSchemaForGemini,
} from "@/lib/agent/providers/schema";
import type { JsonSchema, ToolCall } from "@/lib/agent/providers/types";
import { TOOLS } from "@/lib/agent/tools/registry";

/** Every key Gemini's schema parser accepts. Anything else is a 400. */
const ALLOWED = new Set([
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

function walk(schema: JsonSchema, path: string, visit: (s: JsonSchema, p: string) => void) {
  visit(schema, path);
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    walk(child, `${path}.${name}`, visit);
  }
  if (schema.items) walk(schema.items, `${path}[]`, visit);
}

describe("sanitizeSchemaForGemini against every tool in the registry", () => {
  /* The Part 8 requirement. This is the test that would have caught a new
     tool being added with a keyword Gemini rejects — a failure that would
     otherwise appear only during an Anthropic outage, when the fallback is
     the only thing running. */
  it.each(TOOLS.map((tool) => [tool.def.name, tool] as const))(
    "%s produces a schema Gemini accepts",
    (name, tool) => {
      const sanitized = sanitizeSchemaForGemini(tool.def.parameters);

      walk(sanitized, name, (schema, path) => {
        for (const key of Object.keys(schema)) {
          expect(
            ALLOWED.has(key),
            `${path} carries "${key}", which Gemini rejects`,
          ).toBe(true);
        }
        expect(typeof schema.type, `${path} has no type`).toBe("string");
      });
    },
  );

  it.each(TOOLS.map((tool) => [tool.def.name, tool] as const))(
    "%s keeps every property it declares required",
    (name, tool) => {
      const sanitized = sanitizeSchemaForGemini(tool.def.parameters);
      const known = new Set(Object.keys(sanitized.properties ?? {}));
      for (const required of (sanitized.required as string[] | undefined) ?? []) {
        expect(known.has(required), `${name} requires missing "${required}"`).toBe(
          true,
        );
      }
    },
  );

  it("every tool still declares an object schema after sanitising", () => {
    for (const tool of TOOLS) {
      expect(sanitizeSchemaForGemini(tool.def.parameters).type).toBe("OBJECT");
    }
  });
});

describe("sanitizeSchemaForGemini", () => {
  it("strips the keywords Gemini rejects", () => {
    const sanitized = sanitizeSchemaForGemini({
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      oneOf: [{ type: "string" }],
      $ref: "#/definitions/thing",
      properties: { a: { type: "string" } },
    } as unknown as JsonSchema);

    expect(sanitized).not.toHaveProperty("$schema");
    expect(sanitized).not.toHaveProperty("additionalProperties");
    expect(sanitized).not.toHaveProperty("oneOf");
    expect(sanitized).not.toHaveProperty("$ref");
    expect(sanitized.properties?.a.type).toBe("STRING");
  });

  it("recurses into nested properties and array items", () => {
    /* A rejected keyword three levels deep fails the request exactly as hard
       as one at the top. */
    const sanitized = sanitizeSchemaForGemini({
      type: "object",
      properties: {
        nested: {
          type: "object",
          additionalProperties: false,
          properties: {
            list: {
              type: "array",
              items: { type: "string", pattern: "^x" },
            },
          },
        },
      },
    } as unknown as JsonSchema);

    const nested = sanitized.properties?.nested;
    expect(nested).not.toHaveProperty("additionalProperties");
    expect(nested?.properties?.list.items).not.toHaveProperty("pattern");
  });

  it("keeps a format Gemini allows for the type", () => {
    expect(
      sanitizeSchemaForGemini({ type: "string", format: "date-time" }).format,
    ).toBe("date-time");
    expect(
      sanitizeSchemaForGemini({ type: "integer", format: "int64" }).format,
    ).toBe("int64");
  });

  it("drops a format Gemini rejects rather than failing the request", () => {
    /* "uri" and "email" are ordinary JSON Schema and a 400 here. The field
       is still usable without the annotation. */
    expect(
      sanitizeSchemaForGemini({ type: "string", format: "uri" }),
    ).not.toHaveProperty("format");
    expect(
      sanitizeSchemaForGemini({ type: "integer", format: "int8" }),
    ).not.toHaveProperty("format");
  });

  it("uppercases types", () => {
    expect(sanitizeSchemaForGemini({ type: "array", items: { type: "number" } }))
      .toMatchObject({ type: "ARRAY", items: { type: "NUMBER" } });
  });

  it("preserves enum and description, which carry real meaning", () => {
    const sanitized = sanitizeSchemaForGemini({
      type: "string",
      description: "Candle interval.",
      enum: ["1H", "4H"],
    });
    expect(sanitized.description).toBe("Candle interval.");
    expect(sanitized.enum).toEqual(["1H", "4H"]);
  });

  it("drops a required entry whose property was removed", () => {
    const sanitized = sanitizeSchemaForGemini({
      type: "object",
      properties: { kept: { type: "string" } },
      required: ["kept", "ghost"],
    });
    expect(sanitized.required).toEqual(["kept"]);
  });
});

describe("collapseDuplicateToolCalls", () => {
  const call = (name: string, id: string, args = {}): ToolCall => ({
    id,
    name,
    arguments: args,
  });

  it("keeps distinct tool names untouched", () => {
    const calls = [call("get_positions", "a"), call("get_watchlist", "b")];
    expect(collapseDuplicateToolCalls(calls).calls).toHaveLength(2);
    expect(collapseDuplicateToolCalls(calls).dropped).toEqual([]);
  });

  it("keeps the first of a repeated name and reports the drop", () => {
    /* Gemini matches a response to its call by name, so two calls to one
       tool cannot be round-tripped — the second result would silently
       overwrite the first. */
    const { calls, dropped } = collapseDuplicateToolCalls([
      call("get_funding_rate", "a", { symbol: "SOL" }),
      call("get_funding_rate", "b", { symbol: "BTC" }),
      call("get_positions", "c"),
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0].arguments).toEqual({ symbol: "SOL" });
    expect(calls.map((c) => c.name)).toEqual([
      "get_funding_rate",
      "get_positions",
    ]);
    expect(dropped).toEqual(["get_funding_rate"]);
  });

  it("handles an empty turn", () => {
    expect(collapseDuplicateToolCalls([]).calls).toEqual([]);
  });
});
