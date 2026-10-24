import { describe, expect, it } from "vitest";
import { androidAssetLinks } from "@/lib/referrals/applinks";

const RELEASE = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("androidAssetLinks", () => {
  it("names the package and every usable fingerprint, upper-cased", () => {
    expect(androidAssetLinks(` ${RELEASE.toLowerCase()} , ${RELEASE}`)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: { namespace: "android_app", package_name: "xyz.getelyra.app", sha256_cert_fingerprints: [RELEASE] },
      },
    ]);
  });

  it("publishes nothing rather than a malformed fingerprint", () => {
    expect(androidAssetLinks(undefined)).toBeNull();
    expect(androidAssetLinks("")).toBeNull();
    expect(androidAssetLinks("14:6D:E9")).toBeNull();
  });
});
