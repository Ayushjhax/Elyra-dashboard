import { describe, expect, it } from "vitest";
import { formatDuration, parseSchedule, sessionAt, upcomingHolidays } from "@/lib/markets/schedule";

/* ---------------------------------------------------------------------------
   Sessions from Pyth's published schedules: open, pre-market, after hours,
   a midday break, weekends, holidays and shortened days — on the exchange's
   own clock, across daylight saving.
--------------------------------------------------------------------------- */

/* Pyth's strings for AAPL and the Nomura Nikkei fund, as published. */
const NY_REGULAR =
  "America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;0907/C,1126/C,1127/0930-1300,1224/0930-1300,1225/C,0101/C";
const NY_PRE = "America/New_York;0400-0930,0400-0930,0400-0930,0400-0930,0400-0930,C,C;0907/C,1126/C,1225/C,0101/C";
const NY_POST = "America/New_York;1600-2000,1600-2000,1600-2000,1600-2000,1600-2000,C,C;0907/C,1126/C,1127/1300-1700,1224/1300-1700,1225/C,0101/C";
const TOKYO = "Asia/Tokyo;0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,C,C;1123/C,1231/C,0101/C";

const ny = parseSchedule(NY_REGULAR)!;
const extended = { pre: parseSchedule(NY_PRE), post: parseSchedule(NY_POST) };
const tokyo = parseSchedule(TOKYO)!;
const at = (iso: string) => Date.parse(iso);

describe("parseSchedule", () => {
  it("reads the time zone, the week and the holidays", () => {
    expect(ny.timeZone).toBe("America/New_York");
    expect(ny.week[0]).toEqual([[570, 960]]);
    expect(ny.week[5]).toEqual([]);
    expect(ny.holidays.get("1126")).toEqual([]);
    expect(ny.holidays.get("1127")).toEqual([[570, 780]]);
    expect(tokyo.week[2]).toEqual([
      [540, 690],
      [750, 925],
    ]);
  });

  it("refuses anything malformed rather than guessing", () => {
    expect(parseSchedule(null)).toBeNull();
    expect(parseSchedule("Not/AZone;0900-1500,C,C,C,C,C,C")).toBeNull();
    expect(parseSchedule("Asia/Tokyo;0900-1500,C,C")).toBeNull();
    expect(parseSchedule("Asia/Tokyo;1500-0900,C,C,C,C,C,C")).toBeNull();
    expect(parseSchedule("Asia/Tokyo;O,O,O,O,O,O,O")!.week[6]).toEqual([[0, 1440]]);
  });
});

describe("sessionAt", () => {
  it("is open in the regular session, with the time to the close (winter, UTC−5)", () => {
    /* Wednesday 11 November 2026, 10:00 in New York. */
    expect(sessionAt(at("2026-11-11T15:00:00Z"), ny, extended)).toMatchObject({ kind: "open", closesInMin: 360, localTime: "10:00", localDate: "2026-11-11" });
  });

  it("follows daylight saving (summer, UTC−4)", () => {
    expect(sessionAt(at("2026-07-15T14:00:00Z"), ny, extended)).toMatchObject({ kind: "open", localTime: "10:00", closesInMin: 360 });
  });

  it("names pre-market and after-hours trading, with the time to the next open", () => {
    expect(sessionAt(at("2026-11-11T13:00:00Z"), ny, extended)).toMatchObject({ kind: "pre", opensInMin: 90 });
    expect(sessionAt(at("2026-11-11T22:00:00Z"), ny, extended)).toMatchObject({ kind: "post", opensInMin: 16 * 60 + 30 });
  });

  it("is closed over the weekend and counts to Monday's open", () => {
    /* Saturday 14 November, 12:00 in New York → Monday 09:30. */
    expect(sessionAt(at("2026-11-14T17:00:00Z"), ny, extended)).toMatchObject({ kind: "closed", opensInMin: 45 * 60 + 30 });
  });

  it("is closed on a holiday and keeps a shortened day short", () => {
    expect(sessionAt(at("2026-11-26T15:00:00Z"), ny, extended)).toMatchObject({ kind: "closed", holidayToday: true });
    expect(sessionAt(at("2026-11-27T17:00:00Z"), ny, extended)).toMatchObject({ kind: "open", closesInMin: 60, holidayToday: true });
    expect(sessionAt(at("2026-11-27T19:00:00Z"), ny, extended)).toMatchObject({ kind: "post" });
  });

  it("knows Tokyo's midday break", () => {
    /* 12:00 in Tokyo. */
    expect(sessionAt(at("2026-11-11T03:00:00Z"), tokyo)).toMatchObject({ kind: "break", opensInMin: 30, localTime: "12:00" });
    /* 10:00: the morning half closes at 11:30. */
    expect(sessionAt(at("2026-11-11T01:00:00Z"), tokyo)).toMatchObject({ kind: "open", closesInMin: 90 });
    /* Monday 23 November is a holiday: Sunday evening counts to Tuesday. */
    expect(sessionAt(at("2026-11-22T12:00:00Z"), tokyo)).toMatchObject({ kind: "closed", opensInMin: 24 * 60 + 12 * 60 });
  });

  it("is closed, with nothing to count to, when no session falls in the next two weeks", () => {
    const never = parseSchedule("Asia/Tokyo;C,C,C,C,C,C,C")!;
    expect(sessionAt(at("2026-11-11T03:00:00Z"), never)).toMatchObject({ kind: "closed", opensInMin: null });
  });
});

describe("upcomingHolidays", () => {
  it("lists weekday holidays within the window, closed or shortened", () => {
    /* 24 and 25 December fall outside thirty days. */
    expect(upcomingHolidays(at("2026-11-11T15:00:00Z"), ny, 30)).toEqual([
      { date: "2026-11-26", closed: true },
      { date: "2026-11-27", closed: false },
    ]);
    expect(upcomingHolidays(at("2026-11-11T15:00:00Z"), ny, 45).map((day) => day.date)).toEqual(["2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25"]);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [45, "45m"],
    [125, "2h 05m"],
    [24 * 60 + 12 * 60, "1d 12h"],
  ])("formats %d minutes as %s", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
