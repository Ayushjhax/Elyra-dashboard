import { NextResponse } from "next/server";
import { androidAssetLinks } from "@/lib/referrals/applinks";

/* ---------------------------------------------------------------------------
   /.well-known/assetlinks.json — Android App Links.

   Android fetches this from the website's host to verify that the Elyra app
   may open https://getelyra.xyz/r/* links itself instead of the browser.
   It names the package and the SHA-256 fingerprints of the certificates
   the app is signed with: the dApp Store release key from EAS credentials
   and, for local testing only, a development key.

   The fingerprints come from ANDROID_CERT_SHA256 (comma-separated) rather
   than a committed file, so rotating a key is an environment change and a
   build signed with an unlisted key can never be verified by accident.
   Unset, there is nothing to vouch for, and the file is absent (404).
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export function GET(): Response {
  const links = androidAssetLinks(process.env.ANDROID_CERT_SHA256);
  if (links === null) return NextResponse.json({ error: "Not configured." }, { status: 404 });
  return NextResponse.json(links, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
