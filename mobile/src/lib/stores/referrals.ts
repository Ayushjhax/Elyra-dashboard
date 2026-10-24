import type { ReferralsResponse } from "@/lib/referrals/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The referral programme for this account — /api/referrals: the code and
   link, points from the ledger, the pool, and the referred list, all worked
   out on the server. Read every minute while shown, so an invite that
   activates appears without a pull; a failed refresh keeps the last good
   figures, marked stale, rather than blanking them.
--------------------------------------------------------------------------- */

const store = createAccountStore<ReferralsResponse>({
  pollMs: 60_000,
  retryMs: 2 * 60_000,
  async load(signal) {
    const body = await api.get<ReferralsResponse>("/api/referrals", { signal });
    if (body.stats === null) throw new ApiError(body.error ?? "Your referrals could not be loaded.", 200, body.unconfigured, body);
    return body;
  },
});

export function useReferrals(): AccountFeed<ReferralsResponse> {
  return store.useFeed();
}
