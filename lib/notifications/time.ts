/** A stored wall-clock minute shown in the device's timezone, for today's schedule. */
export function summaryMinuteInZone(
  minute: number,
  from: string,
  to: string,
  now: number,
): number {
  const parts = (at: number, zone: string) => {
    const values = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (name: string) =>
      Number(values.find((part) => part.type === name)?.value);
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: get("hour"),
      minute: get("minute"),
    };
  };
  const day = parts(now, from);
  const target = Date.UTC(
    day.year,
    day.month - 1,
    day.day,
    Math.floor(minute / 60),
    minute % 60,
  );
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = parts(instant, from);
    instant +=
      target -
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
      );
  }
  const device = parts(instant, to);
  return device.hour * 60 + device.minute;
}
export function clockText(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function clockMinute(value: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!matched || Number(matched[1]) > 23 || Number(matched[2]) > 59)
    return null;
  return Number(matched[1]) * 60 + Number(matched[2]);
}
