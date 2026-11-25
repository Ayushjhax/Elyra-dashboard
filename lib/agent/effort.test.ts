import { describe, expect, it } from "vitest";

import { FAST, effortFor } from "@/lib/agent/effort";
import { takesEffort } from "@/lib/agent/providers/anthropic";

describe("takesEffort", () => {
  it("sends effort to the models that take it and to none that refuse it", () => {
    for (const model of ["claude-sonnet-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-2", "claude-opus-4-8", "claude-sonnet-4-6"]) {
      expect(takesEffort(model)).toBe(true);
    }
    for (const model of ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-3-7-sonnet"]) expect(takesEffort(model)).toBe(false);
  });
});

describe("effortFor", () => {
  it("runs the tool-free reviews and spoken replies low, everything else medium, by default", () => {
    expect(effortFor("review", undefined)).toBe("low");
    expect(effortFor("voice", undefined)).toBe("low");
    expect(effortFor("research", undefined)).toBe("medium");
    expect(effortFor("answer", undefined)).toBe("medium");
    expect(effortFor("write", undefined)).toBe("medium");
    expect(effortFor("desk", undefined)).toBe("low");
    expect(Object.keys(FAST).sort()).toEqual(["answer", "desk", "research", "review", "voice", "write"]);
  });

  it("goes back to the model's own default with ANTHROPIC_EFFORT=model", () => {
    expect(effortFor("review", "model")).toBeUndefined();
    expect(effortFor("answer", " Model ")).toBeUndefined();
  });

  it("puts every step at one level when the setting names one, and ignores anything else", () => {
    expect(effortFor("review", "high")).toBe("high");
    expect(effortFor("answer", "LOW")).toBe("low");
    expect(effortFor("review", "max")).toBe("low");
    expect(effortFor("answer", "")).toBe("medium");
  });
});
