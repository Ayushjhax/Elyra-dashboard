import "server-only";

import { randomInt } from "node:crypto";

/* An Arena failure the person should read: its own words and an HTTP status. */
export class ArenaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ArenaError";
  }
}

/** No 0/O or 1/I, so a code read aloud is a code typed right. */
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** An 8-character invite code for a group or a league. */
export function inviteCode(): string {
  return Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join("");
}
