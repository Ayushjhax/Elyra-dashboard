import { describe, expect, it } from "vitest";
import { readAttribution, REFERRAL_HEADER } from "@/lib/referrals/attribution";
import { ATTRIBUTION_COOKIE } from "@/lib/referrals/config";

function request(headers: Record<string, string>): Request {
  return new Request("http://test/api/wallet", { headers });
}

describe("readAttribution", () => {
  it("reads the website's cookie", () => {
    expect(readAttribution(request({ cookie: `${ATTRIBUTION_COOKIE}=AYUSH7P` }))).toBe("AYUSH7P");
  });

  it("reads the app's header, normalised to upper case", () => {
    expect(readAttribution(request({ [REFERRAL_HEADER]: " ayush7p " }))).toBe("AYUSH7P");
  });

  it("ignores a header that is not a well-formed code", () => {
    expect(readAttribution(request({ [REFERRAL_HEADER]: "not a code" }))).toBeNull();
    expect(readAttribution(request({ [REFERRAL_HEADER]: "AB2" }))).toBeNull();
    /* 0, 1, I, L and O are not in the alphabet: they read as one another. */
    expect(readAttribution(request({ [REFERRAL_HEADER]: "AYUSH10" }))).toBeNull();
  });

  it("prefers the cookie when both are present — the first touch in a browser", () => {
    expect(
      readAttribution(request({ cookie: `${ATTRIBUTION_COOKIE}=FIRST22`, [REFERRAL_HEADER]: "OTHER33" })),
    ).toBe("FIRST22");
  });

  it("is null without either", () => {
    expect(readAttribution(request({}))).toBeNull();
  });
});
