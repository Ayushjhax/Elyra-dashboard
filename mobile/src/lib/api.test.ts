import { ApiError, errorFor, onUnauthorized, request, setTokenGetter } from "~/lib/api";

const originalFetch = global.fetch;

function answer(status: number, body: unknown) {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  setTokenGetter(async () => null);
});

describe("errorFor", () => {
  it("uses the server's own words", () => {
    expect(errorFor(400, { error: "That is not a symbol." }).message).toBe("That is not a symbol.");
  });

  it("marks an unconfigured deployment, so the screen can say what is missing", () => {
    const error = errorFor(503, { error: "Alerts need the database.", unconfigured: true });
    expect(error.unconfigured).toBe(true);
    expect(error.status).toBe(503);
  });

  it("says the session ended on a bare 401", () => {
    expect(errorFor(401, null).message).toMatch(/session has ended/i);
  });
});

describe("request", () => {
  it("sends the bearer token and the app version", async () => {
    answer(200, { ok: true });
    setTokenGetter(async () => "token-123");
    await request("/api/health");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-123");
    expect(headers["x-elyra-app"]).toBeTruthy();
  });

  it("does not send the token to a public route", async () => {
    answer(200, {});
    setTokenGetter(async () => "token-123");
    await request("/api/app/config", { auth: false });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("tells every listener when the session ends", async () => {
    answer(401, { error: "Not signed in" });
    const heard = jest.fn();
    const stop = onUnauthorized(heard);
    await expect(request("/api/portfolio")).rejects.toBeInstanceOf(ApiError);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reports an unreachable server in words, not a stack", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(request("/api/portfolio")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/reach Elyra/) });
  });
});
