import { resolveLink, webUrl } from "~/lib/links";

/* Every link the app answers, and the ones it refuses. */

describe("resolveLink", () => {
  it("opens the app's own routes", () => {
    expect(resolveLink("elyra://asset/SOL")).toEqual({ kind: "route", path: "/asset/SOL" });
    expect(resolveLink("elyra://asset/sol")).toEqual({ kind: "route", path: "/asset/SOL" });
    expect(resolveLink("elyra://wallet")).toEqual({ kind: "route", path: "/wallet" });
    expect(resolveLink("elyra://notifications")).toEqual({ kind: "route", path: "/notifications" });
    expect(resolveLink("elyra://research/report/129f9d06-33df-4648-ad38-2a03518f3818")).toEqual({
      kind: "route",
      path: "/report/129f9d06-33df-4648-ad38-2a03518f3818",
    });
    expect(resolveLink("elyra://")).toEqual({ kind: "route", path: "/" });
  });

  it("keeps a referral code from the website's link", () => {
    expect(resolveLink("https://getelyra.xyz/r/abc2345")).toEqual({ kind: "referral", code: "ABC2345" });
    expect(resolveLink("https://www.getelyra.xyz/r/ABC2345")).toEqual({ kind: "referral", code: "ABC2345" });
  });

  it("ignores anything it does not know, or that is malformed", () => {
    expect(resolveLink("elyra://dev")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://swap?amount=999&to=attacker")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://asset/SOL/extra")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://asset/<script>")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://research/report/not-a-uuid")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://wallet/../dev")).toEqual({ kind: "ignored" });
    expect(resolveLink("https://getelyra.xyz/r/BAD")).toEqual({ kind: "ignored" });
    expect(resolveLink("https://getelyra.xyz/research")).toEqual({ kind: "ignored" });
    expect(resolveLink("https://evil.example/r/ABC2345")).toEqual({ kind: "ignored" });
    expect(resolveLink("javascript:alert(1)")).toEqual({ kind: "ignored" });
  });

  it("opens the tool screen only in a development build", () => {
    expect(resolveLink("elyra://dev", { development: true })).toEqual({ kind: "route", path: "/dev" });
    expect(resolveLink("elyra://dev/x", { development: true })).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://dev", { development: false })).toEqual({ kind: "ignored" });
  });

  it("leaves the development client's own links alone, in a development build", () => {
    const development = { development: true };
    expect(resolveLink("elyra://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081", development)).toEqual({ kind: "passthrough" });
    expect(resolveLink("exp+elyra://expo-development-client/?url=x", development)).toEqual({ kind: "passthrough" });
    expect(resolveLink("exp://192.168.1.2:8081", development)).toEqual({ kind: "passthrough" });
  });

  it("checks every link in a release build, whatever it mentions", () => {
    /* The old exception matched the phrase anywhere, so a crafted link
       reached any route with any parameters. */
    expect(resolveLink("elyra://swap?from=SOL&to=BONK&amount=50&x=expo-development-client")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://delete-account#expo-development-client")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://expo-development-client/?url=http%3A%2F%2Fevil.example")).toEqual({ kind: "ignored" });
    expect(resolveLink("exp+elyra://swap?from=SOL")).toEqual({ kind: "ignored" });
    expect(resolveLink("exp://evil.example/--/swap")).toEqual({ kind: "ignored" });
    /* Only the leading form counts, even in development. */
    expect(resolveLink("elyra://swap?x=expo-development-client", { development: true })).toEqual({ kind: "ignored" });
  });

  it("lets only http(s) links leave the app", () => {
    expect(webUrl("https://solscan.io/tx/abc?cluster=devnet")).toBe("https://solscan.io/tx/abc?cluster=devnet");
    expect(webUrl(" https://www.sec.gov/Archives/x.htm ")).toBe("https://www.sec.gov/Archives/x.htm");
    expect(webUrl("http://polymarket.com")).toBe("http://polymarket.com");
    expect(webUrl("solana:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM?amount=10")).toBeNull();
    expect(webUrl("intent://scan/#Intent;scheme=zxing;end")).toBeNull();
    expect(webUrl("elyra://wallet")).toBeNull();
    expect(webUrl("tel:123")).toBeNull();
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl("https://")).toBeNull();
    expect(webUrl("https://user@evil.example")).toBeNull();
    expect(webUrl(null)).toBeNull();
  });

  it("refuses a symbol that is only dots", () => {
    expect(resolveLink("elyra://asset/..")).toEqual({ kind: "ignored" });
    expect(resolveLink("elyra://asset/BTC.D")).toEqual({ kind: "route", path: "/asset/BTC.D" });
  });
});
