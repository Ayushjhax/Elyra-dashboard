
import { expect, it } from "vitest";
import { notificationRoute } from "@/lib/notifications/routes";

it("opens native counterparts of delivery routes", () => {
  expect(notificationRoute("/asset/SOL")).toBe("/asset/SOL");
  expect(notificationRoute("/portfolio/risk")).toBe("/risk");
  expect(notificationRoute("/portfolio/defi")).toBe("/defi");
  expect(notificationRoute("/prediction/123")).toBe("/research?marketId=123");
  expect(notificationRoute("/prediction/signal/abc")).toBe(
    "/research?tab=prediction"
  );
  expect(notificationRoute("/alerts")).toBe("/automation");
});

it("rejects external, malformed and unsupported destinations", () => {
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/asset/%2Fetc",
    "/unknown",
    "/\\evil",
    null,
  ]) {
    expect(notificationRoute(path)).toBe("/notifications");
  }
});
