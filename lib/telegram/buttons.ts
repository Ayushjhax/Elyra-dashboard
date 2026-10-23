/* ---------------------------------------------------------------------------
   What a Telegram inline button carries for a prepared action: an opaque
   handle to the stored row (lib/actions/store.ts), never the amounts.
--------------------------------------------------------------------------- */

/**
 * The string an inline button carries.
 *
 * Prefixed so the webhook can route it without parsing, and bounded because
 * Telegram silently rejects a keyboard whose callback_data exceeds 64 bytes —
 * silently meaning the message sends without the buttons.
 */
export function callbackDataFor(token: string): string {
  const data = `action:${token}`;
  if (Buffer.byteLength(data, "utf8") > 64) {
    throw new Error("callback_data exceeds Telegram's 64-byte limit");
  }
  return data;
}

/** The token out of a callback payload, or null if it is not one of ours. */
export function tokenFromCallback(data: string): string | null {
  const match = /^action:([A-Za-z0-9_-]{16,64})$/.exec(data.trim());
  return match === null ? null : match[1];
}
