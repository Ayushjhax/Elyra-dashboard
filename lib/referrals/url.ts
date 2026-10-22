/* ---------------------------------------------------------------------------
   The referral link — server and website only, because it reads the
   configured base URL from the environment. The Android app shows the link
   /api/referrals returns rather than building one.
--------------------------------------------------------------------------- */

/**
 * Where a referral link points.
 *
 * `APP_URL` is not used: it is a development tunnel in this repository, and a
 * referral link is a durable artifact someone pastes into a group chat. A
 * link that stops working when the tunnel rotates is worse than one that
 * points at production from the start.
 */
export function referralBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REFERRAL_BASE_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }
  return "https://getelyra.xyz";
}

export function referralUrlFor(code: string): string {
  return `${referralBaseUrl()}/r/${code}`;
}
