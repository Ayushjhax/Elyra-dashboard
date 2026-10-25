import { describe, expect, it } from "vitest";
import { serviceUrl } from "@/lib/services";

describe("serviceUrl", () => {
  it("uses the configured URL anywhere", () => {
    expect(serviceUrl("https://engine.example", "http://localhost:8787", "production")).toBe("https://engine.example");
  });

  it("falls back to the local port only in development", () => {
    expect(serviceUrl(undefined, "http://localhost:8787", "development")).toBe("http://localhost:8787");
    expect(serviceUrl(undefined, "http://localhost:8787", "production")).toBeNull();
    expect(serviceUrl("  ", "http://localhost:8787", "production")).toBeNull();
  });
});
