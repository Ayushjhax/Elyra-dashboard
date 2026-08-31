import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCircuitBreaker, route } from "@/lib/agent/providers/router";
import {
  ProviderError,
  type Provider,
  type ProviderRequest,
  type ProviderResult,
} from "@/lib/agent/providers/types";

const request: ProviderRequest = {
  system: { stable: "rules", volatile: "context" },
  messages: [{ role: "user", content: "hello" }],
  tools: [],
};

function ok(
  provider: "anthropic" | "gemini",
  text: string | null = "hi",
): ProviderResult {
  return {
    text,
    toolCalls: [],
    provider,
    model: `${provider}-model`,
    usage: { input: 1, output: 1 },
    refused: false,
    refusalReason: null,
  };
}

function stub(
  id: "anthropic" | "gemini",
  complete: Provider["complete"],
): Provider {
  return { id, model: `${id}-model`, complete };
}

const working = (id: "anthropic" | "gemini") =>
  stub(id, vi.fn(async () => ok(id)));

const failing = (id: "anthropic" | "gemini", error: ProviderError) =>
  stub(
    id,
    vi.fn(async () => {
      throw error;
    }),
  );

const err = (kind: ConstructorParameters<typeof ProviderError>[0], status: number | null = null) =>
  new ProviderError(kind, "anthropic", `simulated ${kind}`, status);

beforeEach(() => {
  resetCircuitBreaker();
});

describe("fallback rules", () => {
  it("uses anthropic when it succeeds and never calls the fallback", async () => {
    const fallback = working("gemini");
    const result = await route(request, {
      primary: working("anthropic"),
      fallback,
    });

    expect(result.provider).toBe("anthropic");
    expect(result.fellBack).toBe(false);
    expect(result.fallbackReason).toBeNull();
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limited", 429],
    ["server_error", 500],
    ["server_error", 503],
    ["network", null],
    ["timeout", null],
  ] as const)("falls back on %s", async (kind, status) => {
    const result = await route(request, {
      primary: failing("anthropic", err(kind, status)),
      fallback: working("gemini"),
    });

    expect(result.provider).toBe("gemini");
    expect(result.primaryProvider).toBe("anthropic");
    expect(result.fellBack).toBe(true);
    expect(result.fallbackReason).toContain(kind);
  });

  it.each(["bad_request", "auth"] as const)(
    "does not fall back on %s",
    async (kind) => {
      const fallback = working("gemini");
      await expect(
        route(request, {
          primary: failing("anthropic", err(kind, 400)),
          fallback,
        }),
      ).rejects.toThrow(ProviderError);

      /* The whole point: Gemini would reject the same malformed request, so
         spending a second round trip to find that out is pure waste. */
      expect(fallback.complete).not.toHaveBeenCalled();
    },
  );

  it("surfaces a refusal instead of shopping for a provider that allows it", async () => {
    const refusal: ProviderResult = { ...ok("anthropic", null), refused: true, refusalReason: "cyber" };
    const fallback = working("gemini");

    const result = await route(request, {
      primary: stub("anthropic", async () => refusal),
      fallback,
    });

    expect(result.refused).toBe(true);
    expect(result.refusalReason).toBe("cyber");
    expect(result.fellBack).toBe(false);
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it("throws the primary error when no fallback is configured", async () => {
    await expect(
      route(request, {
        primary: failing("anthropic", err("server_error", 500)),
        fallback: null,
      }),
    ).rejects.toThrow(/server_error/);
  });
});

describe("circuit breaker", () => {
  const down = () => failing("anthropic", err("server_error", 500));

  async function trip(fallback: Provider) {
    for (let i = 0; i < 3; i += 1) {
      await route(request, { primary: down(), fallback });
    }
  }

  it("opens after three consecutive failures and skips the primary", async () => {
    const fallback = working("gemini");
    await trip(fallback);

    const primary = working("anthropic");
    const result = await route(request, { primary, fallback });

    expect(primary.complete).not.toHaveBeenCalled();
    expect(result.provider).toBe("gemini");
    expect(result.fallbackReason).toContain("circuit_open");
  });

  it("resets the count when the primary succeeds in between", async () => {
    const fallback = working("gemini");
    await route(request, { primary: down(), fallback });
    await route(request, { primary: down(), fallback });
    await route(request, { primary: working("anthropic"), fallback });
    await route(request, { primary: down(), fallback });

    /* Two failures, a success, then one more failure is not three in a row. */
    const primary = working("anthropic");
    await route(request, { primary, fallback });
    expect(primary.complete).toHaveBeenCalled();
  });

  it("lets one trial through after the window and closes on success", async () => {
    const fallback = working("gemini");
    await trip(fallback);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);

      const primary = working("anthropic");
      const trial = await route(request, { primary, fallback });

      expect(primary.complete).toHaveBeenCalled();
      expect(trial.provider).toBe("anthropic");
      expect(trial.fellBack).toBe(false);

      /* Closed again: the next request also reaches the primary. */
      const next = working("anthropic");
      await route(request, { primary: next, fallback });
      expect(next.complete).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not open on bad_request, which says nothing about provider health", async () => {
    const fallback = working("gemini");
    for (let i = 0; i < 3; i += 1) {
      await expect(
        route(request, {
          primary: failing("anthropic", err("bad_request", 400)),
          fallback,
        }),
      ).rejects.toThrow();
    }

    /* A bug in this codebase must not trip the breaker and route everything
       to Gemini. */
    const primary = working("anthropic");
    await route(request, { primary, fallback });
    expect(primary.complete).toHaveBeenCalled();
  });
});
