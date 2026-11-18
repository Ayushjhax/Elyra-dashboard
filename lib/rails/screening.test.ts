import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseLists, resetScreening, screenAddress } = await import("@/lib/rails/screening");

/* ---------------------------------------------------------------------------
   The sanctions screen: read live, cached, and failing closed — an address
   is "clear" only when a list was actually read.
--------------------------------------------------------------------------- */

const LISTED_SOL = "FuCC7GoYwt5TsNTjWL23Xx9UKCvC18chjMEFPL3vJDCC";
const LISTED_EVM = "0x983a81ca6FB1e441266D2FbcB7D8E530AC2E05A2";
const CLEAN = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const NOW = Date.parse("2026-11-16T12:00:00Z");

let calls = 0;
let failing = false;

beforeEach(() => {
  resetScreening();
  calls = 0;
  failing = false;
  vi.stubGlobal("fetch", async (url: string) => {
    calls += 1;
    if (failing) return new Response("", { status: 503 });
    const body = url.endsWith("_SOL.txt") ? `${LISTED_SOL}\n` : url.endsWith("_ETH.txt") ? `${LISTED_EVM}\n` : "";
    return new Response(body, { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("screenAddress", () => {
  it("finds a listed Solana address, and an EVM one whatever its case", async () => {
    expect((await screenAddress(LISTED_SOL, NOW)).status).toBe("listed");
    expect((await screenAddress(LISTED_EVM.toLowerCase(), NOW)).status).toBe("listed");
    expect((await screenAddress(CLEAN, NOW)).status).toBe("clear");
  });

  it("reads the lists once per six hours", async () => {
    await screenAddress(CLEAN, NOW);
    const first = calls;
    await screenAddress(CLEAN, NOW + 60_000);
    expect(calls).toBe(first);
    await screenAddress(CLEAN, NOW + 7 * 60 * 60_000);
    expect(calls).toBe(first * 2);
  });

  it("uses a recent list when a refresh fails, and says unavailable when there is none", async () => {
    await screenAddress(CLEAN, NOW);
    failing = true;
    expect((await screenAddress(LISTED_SOL, NOW + 7 * 60 * 60_000)).status).toBe("listed");
    expect((await screenAddress(CLEAN, NOW + 49 * 60 * 60_000)).status).toBe("unavailable");
    resetScreening();
    expect((await screenAddress(CLEAN, NOW)).status).toBe("unavailable");
  });

  it("treats an empty read as broken, not as a world without sanctions", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    expect((await screenAddress(CLEAN, NOW)).status).toBe("unavailable");
  });

  it("ignores blank lines and comments when parsing", () => {
    expect([...parseLists([`# header\n\n${LISTED_SOL}\r\n${LISTED_EVM}\n`])]).toEqual([LISTED_SOL, LISTED_EVM.toLowerCase()]);
  });
});
