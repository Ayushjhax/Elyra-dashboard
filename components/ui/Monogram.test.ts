import { describe, expect, it } from "vitest";
import { initials, toneFor } from "@/components/ui/Monogram";

describe("initials", () => {
  it("skips words that only say what a company is", () => {
    expect(initials("Churchill Direct Lending Fund")).toBe("CD");
    expect(initials("Spring Valley Acquisition Corp. V")).toBe("SV");
    expect(initials("The Coca-Cola Company")).toBe("CC");
    expect(initials("Powerus Corp")).toBe("PO");
    expect(initials("PUSA")).toBe("PU");
  });

  it("never comes back empty", () => {
    expect(initials("Inc.")).toBe("I");
  });
});

describe("toneFor", () => {
  it("is stable for a name and spreads across names", () => {
    expect(toneFor("Powerus Corp")).toEqual(toneFor("powerus corp"));
    const tones = new Set(["A Co", "B Co", "Churchill", "Spring Valley", "Canagold", "Lifeway", "Joby"].map((name) => toneFor(name)[0]));
    expect(tones.size).toBeGreaterThan(3);
  });
});
