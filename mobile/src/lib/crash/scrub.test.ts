import { scrubBreadcrumb, scrubEvent, scrubText } from "~/lib/crash/scrub";

const SOLANA = "JDYYuKzGir6TTRiXYrrPPks2oQbDz3GeciMSNSk3zQ8U";
const EVM = "0xf28e42d20e4826f2b10a24bc952001697947cab2";
const SIGNATURE = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cHJpdnk6YWJjIn0.c2lnbmF0dXJlLWJ5dGVz";

describe("scrubText", () => {
  it("removes wallet addresses and signatures", () => {
    expect(scrubText(`Transfer from ${SOLANA} failed`)).toBe("Transfer from [address] failed");
    expect(scrubText(`Hyperliquid ${EVM} unreachable`)).toBe("Hyperliquid [evm-address] unreachable");
    expect(scrubText(`tx ${SIGNATURE} expired`)).toBe("tx [signature] expired");
  });

  it("removes tokens, user ids and emails", () => {
    expect(scrubText(`authorization: Bearer ${JWT}`)).toBe("authorization: Bearer [redacted]");
    expect(scrubText(`token ${JWT}`)).toBe("token [jwt]");
    expect(scrubText("ExponentPushToken[abc123XYZ]")).toBe("[push-token]");
    expect(scrubText("profile for did:privy:cmvlbw8g600n20gkzwqlcgwim")).toBe("profile for [user]");
    expect(scrubText("sent to someone@example.com")).toBe("sent to [email]");
  });

  it("keeps a URL's origin and path but not its query", () => {
    expect(scrubText(`GET https://mainnet.helius-rpc.com/?api-key=abcdef123456`)).toBe("GET https://mainnet.helius-rpc.com/?[redacted]");
    expect(scrubText(`https://api.getelyra.xyz/api/wallet/activity?address=${SOLANA}`)).toBe(
      "https://api.getelyra.xyz/api/wallet/activity?[redacted]",
    );
    expect(scrubText("signature=abc&x=1")).toBe("signature=[redacted]&x=1");
  });

  it("leaves ordinary words and numbers alone", () => {
    expect(scrubText("TypeError: Cannot read property 'price' of undefined")).toBe("TypeError: Cannot read property 'price' of undefined");
    expect(scrubText("SOL crossed above $150.00 at 12:04")).toBe("SOL crossed above $150.00 at 12:04");
  });
});

describe("scrubEvent", () => {
  it("scrubs every string in the event, drops the user and headers, and keeps where the code is", () => {
    const event = {
      message: `Swap for ${SOLANA}`,
      user: { id: "did:privy:abc", ip_address: "1.2.3.4" },
      request: { url: `https://api.getelyra.xyz/api/swap/build?wallet=${SOLANA}`, headers: { authorization: `Bearer ${JWT}` } },
      exception: {
        values: [
          {
            type: "Error",
            value: `Wallet ${SOLANA} is not on this account`,
            stacktrace: { frames: [{ filename: "app:///src/lib/wallet/signer.ts", function: "signerFor", lineno: 176, vars: { address: SOLANA } }] },
          },
        ],
      },
      breadcrumbs: [{ category: "touch", message: `Wallet address ${SOLANA}` }, { category: "fetch", data: { url: `https://x.test/a?k=${JWT}` } }],
      extra: { nested: [{ deep: `email me at a@b.co about ${EVM}` }] },
    };

    const scrubbed = scrubEvent(event);
    const text = JSON.stringify(scrubbed);

    expect(text).not.toContain(SOLANA);
    expect(text).not.toContain(EVM);
    expect(text).not.toContain(JWT);
    expect(text).not.toContain("did:privy");
    expect(text).not.toContain("a@b.co");
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed.request).not.toHaveProperty("headers");
    expect(scrubbed.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: "app:///src/lib/wallet/signer.ts",
      function: "signerFor",
      lineno: 176,
    });
    expect(scrubbed.message).toBe("Swap for [address]");
    /* The original is untouched. */
    expect(event.message).toContain(SOLANA);
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console lines", () => {
    expect(scrubBreadcrumb({ category: "console", message: "[auth] clean-up failed" })).toBeNull();
  });

  it("keeps only that a tap happened, not what the control said", () => {
    const tap = scrubBreadcrumb({ category: "touch", message: "Touch event within element: SOL, 2.5 SOL, $255.10", data: { path: [{ label: "Why is SOL moving?" }] } });
    expect(tap).toEqual({ category: "touch" });
  });

  it("scrubs a request's URL", () => {
    expect(scrubBreadcrumb({ category: "fetch", data: { url: `https://api.getelyra.xyz/api/tracker/wallets/${SOLANA}`, method: "GET" } })).toEqual({
      category: "fetch",
      data: { url: "https://api.getelyra.xyz/api/tracker/wallets/[address]", method: "GET" },
    });
  });
});
