/* ---------------------------------------------------------------------------
   Android app versions, compared the way people write them: "1.10.0" is
   newer than "1.9.2". Shared by /api/app/config and the app's update gate.
--------------------------------------------------------------------------- */

/** The numeric parts of "1.4.2" (a pre-release suffix such as "-beta.1" is ignored). Null when malformed. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative when a is older than b, positive when newer, 0 when equal. Malformed sorts oldest. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) return left === null ? (right === null ? 0 : -1) : 1;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** Whether a build must update before it can be used. An unreadable version must, too. */
export function mustUpdate(current: string, minSupported: string): boolean {
  return parseVersion(current) === null || compareVersions(current, minSupported) < 0;
}
