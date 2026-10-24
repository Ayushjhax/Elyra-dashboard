/* ---------------------------------------------------------------------------
   The Digital Asset Links statement for the Android app, from its signing
   certificates' SHA-256 fingerprints. Pure, so the shape Android requires is
   tested directly.
--------------------------------------------------------------------------- */

export const ANDROID_PACKAGE = "xyz.getelyra.app";

/** "AB:CD:…" — 32 colon-separated hex pairs, upper case, as Android expects. */
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export interface AssetLinkStatement {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

/**
 * The statement for a comma-separated list of fingerprints, or null when
 * none is usable. Each is normalised to upper case; one that is not a
 * SHA-256 fingerprint is dropped rather than published.
 */
export function androidAssetLinks(raw: string | undefined): AssetLinkStatement[] | null {
  const fingerprints = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => FINGERPRINT.test(entry));
  if (fingerprints.length === 0) return null;
  return [
    {
      /* handle_all_urls: getelyra.xyz/r/… links open the app. get_login_creds:
         a passkey made for getelyra.xyz works in the app too (Android's
         Credential Manager checks it; Privy's passkey sign-in uses
         getelyra.xyz as its relying party). */
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [...new Set(fingerprints)] },
    },
  ];
}
