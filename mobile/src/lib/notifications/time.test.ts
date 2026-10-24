import {
  clockMinute,
  clockText,
  summaryMinuteInZone,
} from "@/lib/notifications/time";
it("shows an existing UTC schedule in a half-hour device timezone", () => {
  expect(
    summaryMinuteInZone(
      540,
      "UTC",
      "Asia/Kolkata",
      Date.parse("2026-01-10T00:00:00Z"),
    ),
  ).toBe(870);
});
it("uses the source zone and daylight-saving offset rather than a fixed offset", () => {
  expect(
    summaryMinuteInZone(
      540,
      "America/New_York",
      "UTC",
      Date.parse("2026-01-10T00:00:00Z"),
    ),
  ).toBe(840);
  expect(
    summaryMinuteInZone(
      540,
      "America/New_York",
      "UTC",
      Date.parse("2026-07-10T00:00:00Z"),
    ),
  ).toBe(780);
});
it("validates local time input", () => {
  expect(clockMinute("9:30")).toBe(570);
  expect(clockText(570)).toBe("09:30");
  for (const text of ["24:00", "12:60", "-1:00", "hello", "12"])
    expect(clockMinute(text)).toBeNull();
});
