import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/market/http", () => ({ fetchJson: state.fetchJson }));

import { clearTokenCache, verifiedIcons } from "@/lib/solana/tokens";

describe("verifiedIcons", () => {
  beforeEach(() => {
    clearTokenCache();
    state.fetchJson.mockReset();
  });

  it("returns Jupiter's verified artwork, https only, and nothing for an unverified mint", async () => {
    state.fetchJson.mockResolvedValue([
      { id: "XsTSLA", symbol: "TSLAx", name: "Tesla xStock", decimals: 8, icon: "https://xstocks.test/tsla.png" },
      { id: "OnTSLA", symbol: "TSLAon", name: "Tesla (Ondo)", decimals: 9, icon: "http://ondo.test/tsla.png" },
      { id: "NoIcon", symbol: "AAPLx", name: "Apple xStock", decimals: 8, icon: null },
    ]);
    const icons = await verifiedIcons(["XsTSLA", "OnTSLA", "NoIcon", "NotVerified"]);
    expect([...icons]).toEqual([["XsTSLA", "https://xstocks.test/tsla.png"]]);
  });

  it("gives no icons, rather than failing, when the index cannot be read", async () => {
    state.fetchJson.mockRejectedValue(new Error("upstream down"));
    expect((await verifiedIcons(["XsTSLA"])).size).toBe(0);
  });
});
