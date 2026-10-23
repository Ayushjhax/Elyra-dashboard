import { request, setTokenGetter } from "~/lib/api";
import { forgetReferral, referralForRequest, rememberReferral } from "~/lib/referral";

/* A referral link's code: first touch wins, it rides along on signed-in
   requests until one succeeds, and is then forgotten. Secure storage is
   held in memory here. */

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const originalFetch = global.fetch;
let seen: (string | null)[] = [];

function answer(status: number) {
  global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get("x-elyra-referral"));
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  seen = [];
  await forgetReferral();
  setTokenGetter(async () => "token");
});

afterEach(() => {
  global.fetch = originalFetch;
  setTokenGetter(async () => null);
});

describe("a referral code", () => {
  it("keeps the first link's code, not a later one", async () => {
    await rememberReferral("abc2345");
    await rememberReferral("ZZZ9999");
    expect(await referralForRequest()).toBe("ABC2345");
  });

  it("ignores a malformed code", async () => {
    await rememberReferral("nope");
    expect(await referralForRequest()).toBeNull();
  });

  it("is sent on a signed-in request, then forgotten once one succeeds", async () => {
    await rememberReferral("ABC2345");
    answer(200);
    await request("/api/portfolio");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await request("/api/portfolio");
    expect(seen).toEqual(["ABC2345", null]);
  });

  it("is kept when the request failed, for the next one", async () => {
    await rememberReferral("ABC2345");
    answer(503);
    await expect(request("/api/portfolio")).rejects.toThrow();
    expect(await referralForRequest()).toBe("ABC2345");
  });

  it("is never sent without a session", async () => {
    await rememberReferral("ABC2345");
    setTokenGetter(async () => null);
    answer(200);
    await request("/api/config", { auth: false });
    expect(seen).toEqual([null]);
  });
});
