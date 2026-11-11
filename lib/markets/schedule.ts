/* ---------------------------------------------------------------------------
   Exchange sessions, from Pyth's published schedules. Pure.

   Pyth publishes each feed's trading hours as one string:

     America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;1126/C,1127/0930-1300

   - the exchange's time zone;
   - seven day entries, Monday to Sunday: `C` closed, `O` open all day, or
     ranges `HHMM-HHMM` joined by `&` (Tokyo's lunch break is
     `0900-1130&1230-1525`);
   - holiday overrides `MMDD/…` in the same notation, covering the coming
     year. A date's override replaces its weekday entry.

   All arithmetic is on the exchange's wall clock, through Intl, so daylight
   saving is the time zone database's problem rather than this file's. The
   one approximation: "opens in" across a clock change can be an hour out.
--------------------------------------------------------------------------- */

export interface Schedule {
  timeZone: string;
  /** Monday first. Each day is a list of [start, end) minutes after local midnight. */
  week: Array<Array<[number, number]>>;
  /** "MMDD" → that day's ranges (empty when closed). */
  holidays: Map<string, Array<[number, number]>>;
}

export type SessionKind = "open" | "pre" | "post" | "break" | "closed";

export interface SessionStatus {
  kind: SessionKind;
  /** Minutes until the regular session next opens; null when open or none is found within two weeks. */
  opensInMin: number | null;
  /** Minutes until the current regular session (or its morning half) closes; null when not open. */
  closesInMin: number | null;
  /** Local wall-clock time, "HH:MM". */
  localTime: string;
  /** Local date, "YYYY-MM-DD". */
  localDate: string;
  /** Whether today is a listed holiday (closed or shortened). */
  holidayToday: boolean;
}

function minutes(hhmm: string): number | null {
  if (!/^\d{4}$/.test(hhmm)) return null;
  const hours = Number(hhmm.slice(0, 2));
  const mins = Number(hhmm.slice(2));
  if (hours > 24 || mins > 59 || (hours === 24 && mins > 0)) return null;
  return hours * 60 + mins;
}

function parseDay(entry: string): Array<[number, number]> | null {
  const text = entry.trim();
  if (text === "C") return [];
  if (text === "O") return [[0, 1440]];
  const ranges: Array<[number, number]> = [];
  for (const part of text.split("&")) {
    const [from, to] = part.split("-");
    const start = minutes(from ?? "");
    const end = minutes(to ?? "");
    if (start === null || end === null || end <= start) return null;
    ranges.push([start, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** Null for anything that does not parse — a bad schedule shows as unknown, never as a guess. */
export function parseSchedule(text: string | null | undefined): Schedule | null {
  if (typeof text !== "string") return null;
  const [timeZone, days, holidayText] = text.split(";");
  if (!timeZone || !days) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return null;
  }
  const entries = days.split(",");
  if (entries.length !== 7) return null;
  const week: Array<Array<[number, number]>> = [];
  for (const entry of entries) {
    const day = parseDay(entry);
    if (day === null) return null;
    week.push(day);
  }
  const holidays = new Map<string, Array<[number, number]>>();
  for (const item of (holidayText ?? "").split(",")) {
    const [date, value] = item.trim().split("/");
    if (!date || !value || !/^\d{4}$/.test(date)) continue;
    const day = parseDay(value);
    if (day !== null) holidays.set(date, day);
  }
  return { timeZone, week, holidays };
}

interface WallClock {
  date: string;
  /** "MMDD". */
  monthDay: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  minute: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function wallClock(at: number, timeZone: string): WallClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    monthDay: `${parts.month}${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The ranges a schedule has on the local day `offset` days after `clock`'s. */
function rangesOn(schedule: Schedule, at: number, offsetDays: number): Array<[number, number]> {
  /* Noon, so stepping whole days never lands on the wrong date across a clock change. */
  const base = wallClock(at, schedule.timeZone);
  const noon = at + (12 * 60 - base.minute) * 60_000 + offsetDays * 86_400_000;
  const day = wallClock(noon, schedule.timeZone);
  return schedule.holidays.get(day.monthDay) ?? schedule.week[day.weekday] ?? [];
}

const inside = (ranges: Array<[number, number]>, minute: number) => ranges.some(([start, end]) => minute >= start && minute < end);

/** Minutes from `at` to the next range start in the schedule, looking up to `days` ahead. */
function minutesToNextStart(schedule: Schedule, at: number, days = 14): number | null {
  const now = wallClock(at, schedule.timeZone).minute;
  for (let offset = 0; offset <= days; offset += 1) {
    for (const [start] of rangesOn(schedule, at, offset)) {
      const delta = offset * 1440 + start - now;
      if (delta > 0) return delta;
    }
  }
  return null;
}

/**
 * Where an exchange is in its day. `regular` decides open, break and closed;
 * `pre` and `post` (US only) name the extended sessions around it.
 */
export function sessionAt(at: number, regular: Schedule, extended: { pre?: Schedule | null; post?: Schedule | null } = {}): SessionStatus {
  const clock = wallClock(at, regular.timeZone);
  const today = rangesOn(regular, at, 0);
  const base = {
    localTime: `${String(Math.floor(clock.minute / 60)).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")}`,
    localDate: clock.date,
    holidayToday: regular.holidays.has(clock.monthDay),
  };

  const current = today.find(([start, end]) => clock.minute >= start && clock.minute < end);
  if (current !== undefined) {
    return { ...base, kind: "open", opensInMin: null, closesInMin: current[1] - clock.minute };
  }

  const opensInMin = minutesToNextStart(regular, at);
  const between = today.some(([, end]) => end <= clock.minute) && today.some(([start]) => start > clock.minute);
  if (between) return { ...base, kind: "break", opensInMin, closesInMin: null };

  if (extended.pre && inside(rangesOn(extended.pre, at, 0), wallClock(at, extended.pre.timeZone).minute)) {
    return { ...base, kind: "pre", opensInMin, closesInMin: null };
  }
  if (extended.post && inside(rangesOn(extended.post, at, 0), wallClock(at, extended.post.timeZone).minute)) {
    return { ...base, kind: "post", opensInMin, closesInMin: null };
  }
  return { ...base, kind: "closed", opensInMin, closesInMin: null };
}

/** The next holidays (closed or shortened days) within `days`, soonest first. */
export function upcomingHolidays(at: number, schedule: Schedule, days = 30): Array<{ date: string; closed: boolean }> {
  const out: Array<{ date: string; closed: boolean }> = [];
  const base = wallClock(at, schedule.timeZone);
  for (let offset = 0; offset <= days; offset += 1) {
    const noon = at + (12 * 60 - base.minute) * 60_000 + offset * 86_400_000;
    const day = wallClock(noon, schedule.timeZone);
    const override = schedule.holidays.get(day.monthDay);
    /* A holiday that falls on a weekend changes nothing worth saying. */
    if (override !== undefined && day.weekday < 5) out.push({ date: day.date, closed: override.length === 0 });
  }
  return out;
}

/** "2h 05m", "45m", "3d 4h" — for "opens in" and "closes in". */
export function formatDuration(totalMinutes: number): string {
  const minutesLeft = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutesLeft / 1440);
  const hours = Math.floor((minutesLeft % 1440) / 60);
  const mins = minutesLeft % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}
