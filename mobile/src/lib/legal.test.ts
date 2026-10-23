import { DISCLOSURES, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL, supportMailto } from "~/lib/legal";

jest.mock("expo-application", () => ({ nativeBuildVersion: "7" }));
jest.mock("expo-device", () => ({ manufacturer: "Solana Mobile", modelName: "Seeker", osVersion: "15", osName: "Android" }));
jest.mock("~/lib/api", () => ({ APP_VERSION: "1.2.3" }));

describe("support mail", () => {
  it("prefills the app version and the phone, and nothing about the account", () => {
    const url = supportMailto();
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);

    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("subject")).toBe("Elyra 1.2.3 (7) support");
    const body = params.get("body") ?? "";
    expect(body).toContain("App: Elyra 1.2.3 (7)");
    expect(body).toContain("Device: Solana Mobile Seeker");
    expect(body).toMatch(/System: (Android 15|ios 15|Android)/);

    /* Only those three lines of facts: no address, id or email. */
    expect(body.split("\n").filter((line) => line.includes(":")).length).toBe(4);
    expect(body).not.toMatch(/did:privy|@|0x|wallet/i);
  });

  it("names the device as unknown when the system does not say", () => {
    const params = new URLSearchParams(supportMailto({ model: null, os: "Android 15" }).split("?")[1]);
    expect(params.get("body")).toContain("Device: Unknown");
  });
});

describe("legal", () => {
  it("links the website's policy and terms", () => {
    expect(PRIVACY_URL).toBe("https://getelyra.xyz/privacy");
    expect(TERMS_URL).toBe("https://getelyra.xyz/terms");
  });

  it("says each disclosure the store listing relies on", () => {
    const titles = DISCLOSURES.map((entry) => entry.title);
    expect(titles).toEqual([
      "Not financial advice",
      "AI answers can be wrong",
      "Elyra never holds your keys",
      "Venue connections are read-only",
      "Swaps and prices",
      "Third-party names",
    ]);
  });
});
