import { resolveLink } from "~/lib/links";
import { rememberReferral } from "~/lib/referral";
import { currentAccount } from "~/lib/session";

/* ---------------------------------------------------------------------------
   Every link that opens the app passes through here before the router —
   an App Link to https://getelyra.xyz/r/CODE, or the app's own scheme
   (elyra://asset/SOL, elyra://wallet, elyra://notifications,
   elyra://research/report/<id>).

   lib/links.ts decides what each means, as an allowlist: a known route
   with valid parts is opened, a referral code is kept for sign-up, and
   anything else lands on the home screen. Nothing here may throw — a bad
   link must never stop the app opening.
--------------------------------------------------------------------------- */

export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  try {
    const target = resolveLink(path, { development: __DEV__ });
    switch (target.kind) {
      case "passthrough":
        return path;
      case "route":
        return target.path;
      case "referral":
        /* Kept only for someone not yet signed in: an existing account is
           never re-attributed, here or on the server. */
        if (currentAccount() === null) await rememberReferral(target.code);
        return "/";
      case "ignored":
        return "/";
    }
  } catch {
    return "/";
  }
}
