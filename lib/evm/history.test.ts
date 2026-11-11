import { describe, expect, it } from "vitest";
import { evmActivity, summariseEvmTx, type EvmMovement, type EvmTxHead } from "@/lib/evm/history";
import { filterEvents, DEFAULT_FILTERS } from "@/lib/activity/filter";
import { accountEvents } from "@/lib/activity/events";

const ME = "0xAbC0000000000000000000000000000000000001";
const THEM = "0x2222222222222222222222222222222222222222";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SPAM = "0x9999999999999999999999999999999999999999";

function head(over: Partial<EvmTxHead> = {}): EvmTxHead {
  return { hash: "0x01", at: "2026-11-10T10:00:00.000Z", block: 100, status: "confirmed", from: ME, to: THEM, method: null, ...over };
}

function move(over: Partial<EvmMovement> = {}): EvmMovement {
  return { hash: "0x01", contract: null, symbol: "ETH", icon: null, amount: -0.5, counterparty: THEM, ...over };
}

describe("summariseEvmTx", () => {
  it("names a plain ETH send and a token receive", () => {
    expect(summariseEvmTx(ME, head(), [move()])).toMatchObject({ kind: "send", title: "Sent 0.5 ETH to 0x22…2222", counterparty: THEM });
    const received = summariseEvmTx(ME, head({ from: THEM, to: USDC, method: "transfer" }), [
      move({ contract: USDC, symbol: "USDC", amount: 250, counterparty: THEM }),
    ]);
    expect(received).toMatchObject({ kind: "receive", title: "Received 250 USDC", unverifiedOnly: false });
  });

  it("calls a two-way movement a swap", () => {
    const summary = summariseEvmTx(ME, head({ method: "swapExactTokensForETH" }), [
      move({ contract: USDC, symbol: "USDC", amount: -100 }),
      move({ amount: 0.04 }),
    ]);
    expect(summary).toMatchObject({ kind: "swap", title: "Swapped 100 USDC for 0.04 ETH", via: "Swap exact tokens for eth" });
  });

  it("names a contract call by its method when what came back is not shown", () => {
    const summary = summariseEvmTx(ME, head({ method: "execute" }), [move({ contract: USDC, symbol: "USDC", amount: -100 })]);
    expect(summary).toMatchObject({ kind: "other", title: "Execute · 100 USDC" });
  });

  it("never names an unlisted token by the symbol it claims", () => {
    const summary = summariseEvmTx(ME, head({ from: THEM }), [move({ contract: SPAM, symbol: null, amount: 1000, counterparty: THEM })]);
    expect(summary).toMatchObject({ kind: "receive", title: "Received an unverified token", unverifiedOnly: true });
    expect(summary.amounts[0]).toMatchObject({ symbol: null, mint: SPAM });
  });

  it("says what an approval and a bare call were", () => {
    expect(summariseEvmTx(ME, head({ method: "approve" }), []).title).toBe("Approved a token for spending");
    expect(summariseEvmTx(ME, head({ method: "0xdeadbeef" }), []).title).toBe("Contract interaction");
  });
});

describe("evmActivity", () => {
  it("folds transactions into feed rows with their network and explorer link", () => {
    const rows = evmActivity(
      "robinhood",
      ME,
      [head({ hash: "0xaa", block: 5 }), head({ hash: "0xbb", block: 9 }), head({ hash: "0xaa", block: 5, from: THEM })],
      [move({ hash: "0xaa" }), move({ hash: "0xbb", amount: 1, counterparty: THEM })],
      10,
    );
    expect(rows.map((row) => row.signature)).toEqual(["0xbb", "0xaa"]);
    expect(rows[1]).toMatchObject({
      network: "robinhood",
      href: "https://robinhoodchain.blockscout.com/tx/0xaa",
      summary: { kind: "send" },
    });
  });

  it("filters by network, and keeps each row's own explorer link", () => {
    const evm = evmActivity("ethereum", ME, [head({ hash: "0xcc" })], [move({ hash: "0xcc" })], 10);
    const events = accountEvents({
      wallet: [...evm, { signature: "sol1", status: "confirmed", slot: 1, at: "2026-11-10T09:00:00.000Z", memo: null }],
      venue: [],
      alerts: [],
      actions: [],
      explorer: (signature) => `https://solscan.io/tx/${signature}`,
      alertNote: "",
    });
    expect(events.find((event) => event.id === "tx:0xcc")?.href).toBe("https://etherscan.io/tx/0xcc");
    expect(events.find((event) => event.id === "tx:sol1")?.href).toBe("https://solscan.io/tx/sol1");
    const now = Date.parse("2026-11-11T00:00:00.000Z");
    expect(filterEvents(events, { ...DEFAULT_FILTERS, network: "ethereum" }, now).map((event) => event.id)).toEqual(["tx:0xcc"]);
    expect(filterEvents(events, { ...DEFAULT_FILTERS, network: "solana" }, now).map((event) => event.id)).toEqual(["tx:sol1"]);
  });
});
