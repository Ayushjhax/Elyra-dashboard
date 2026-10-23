import { resolveLink } from "~/lib/links";

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

  it("leaves the development client's own links alone", () => {
    expect(resolveLink("elyra://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081")).toEqual({ kind: "passthrough" });
  });
});
