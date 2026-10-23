import { describe, expect, it } from "vitest";
import { compareVersions, mustUpdate, parseVersion } from "@/lib/appVersion";

describe("app versions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("1.10.0", "1.9.2")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });

  it("ignores a pre-release suffix", () => {
    expect(parseVersion("1.4.0-beta.2")).toEqual([1, 4, 0]);
  });

  it("makes an older or unreadable build update", () => {
    expect(mustUpdate("1.0.0", "1.1.0")).toBe(true);
    expect(mustUpdate("1.1.0", "1.1.0")).toBe(false);
    expect(mustUpdate("garbage", "0.0.0")).toBe(true);
  });
});
