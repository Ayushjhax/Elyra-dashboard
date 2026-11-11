import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signL1Action } from "@/lib/autotrade/sign";
import {
  actionHash,
  approveAgentAction,
  approveAgentTypedData,
  splitSignature,
  floorSize,
  limitOrder,
  orderAction,
  roundPerpPrice,
  toWire,
  triggerOrder,
} from "@/lib/autotrade/wire";

/* ---------------------------------------------------------------------------
   Held to Hyperliquid's own vectors: hyperliquid-python-sdk tests/signing_test.py.

   A signature that differs by one byte is an order the exchange rejects — or,
   worse, one signed over something other than what was meant. These are the
   exact cases the official SDK asserts, so Elyra's encoding is the SDK's.
   The SDK prints r without leading zeros, so r and s are compared as numbers.
--------------------------------------------------------------------------- */

const KEY = "0x0123456789012345678901234567890123456789012345678901234567890123" as const;

function expectSignature(actual: { r: string; s: string; v: number }, r: string, s: string, v: number) {
  expect(BigInt(actual.r)).toBe(BigInt(r));
  expect(BigInt(actual.s)).toBe(BigInt(s));
  expect(actual.v).toBe(v);
}

describe("Hyperliquid action hashing", () => {
  it("matches production: the phantom agent for a 0.0147 ETH IOC order", () => {
    const action = orderAction([limitOrder({ asset: 4, isBuy: true, price: "1670.1", size: "0.0147", reduceOnly: false, tif: "Ioc" })]);
    expect(actionHash(action, 1677777606040)).toBe("0x0fcbeda5ae3c4950a548021552a4fea2226858c4453571bf3f24ba017eac2908");
  });
});

describe("Hyperliquid L1 signing", () => {
  it("signs the SDK's dummy action on mainnet and testnet", async () => {
    const action = { type: "dummy", num: 100_000_000_000 };
    expectSignature(
      await signL1Action(KEY, action, 0, "mainnet"),
      "0x53749d5b30552aeb2fca34b530185976545bb22d0b3ce6f62e31be961a59298",
      "0x755c40ba9bf05223521753995abb2f73ab3229be8ec921f350cb447e384d8ed8",
      27,
    );
    expectSignature(
      await signL1Action(KEY, action, 0, "testnet"),
      "0x542af61ef1f429707e3c76c5293c80d01f74ef853e34b76efffcb57e574f9510",
      "0x17b8b32f086e8cdede991f1e2c529f5dd5297cbe8128500e00cbaf766204a613",
      28,
    );
  });

  it("signs a GTC limit order", async () => {
    const action = orderAction([limitOrder({ asset: 1, isBuy: true, price: "100", size: "100", reduceOnly: false, tif: "Gtc" })]);
    expectSignature(
      await signL1Action(KEY, action, 0, "mainnet"),
      "0xd65369825a9df5d80099e513cce430311d7d26ddf477f5b3a33d2806b100d78e",
      "0x2b54116ff64054968aa237c20ca9ff68000f977c93289157748a3162b6ea940e",
      28,
    );
  });

  it("signs an order carrying a client order id", async () => {
    const action = orderAction([
      limitOrder({ asset: 1, isBuy: true, price: "100", size: "100", reduceOnly: false, tif: "Gtc", cloid: "0x00000000000000000000000000000001" }),
    ]);
    expectSignature(
      await signL1Action(KEY, action, 0, "mainnet"),
      "0x41ae18e8239a56cacbc5dad94d45d0b747e5da11ad564077fcac71277a946e3",
      "0x3c61f667e747404fe7eea8f90ab0e76cc12ce60270438b2058324681a00116da",
      27,
    );
    expectSignature(
      await signL1Action(KEY, action, 0, "testnet"),
      "0xeba0664bed2676fc4e5a743bf89e5c7501aa6d870bdb9446e122c9466c5cd16d",
      "0x7f3e74825c9114bc59086f1eebea2928c190fdfbfde144827cb02b85bbe90988",
      28,
    );
  });

  it("signs a stop-loss trigger order", async () => {
    /* The SDK's vector is a non-reduce-only trigger; built here field by field. */
    const order = { ...triggerOrder({ asset: 1, isBuy: true, triggerPrice: "103", limitPrice: "100", size: "100", tpsl: "sl" }), r: false };
    const action = orderAction([order]);
    expectSignature(
      await signL1Action(KEY, action, 0, "mainnet"),
      "0x98343f2b5ae8e26bb2587daad3863bc70d8792b09af1841b6fdd530a2065a3f9",
      "0x6b5bb6bb0633b710aa22b721dd9dee6d083646a5f8e581a20b545be6c1feb405",
      27,
    );
    expectSignature(
      await signL1Action(KEY, action, 0, "testnet"),
      "0x971c554d917c44e0e1b6cc45d8f9404f32172a9d3b3566262347d0302896a2e4",
      "0x206257b104788f80450f8e786c329daa589aa0b32ba96948201ae556d5637eac",
      28,
    );
  });
});

describe("Hyperliquid user-signed actions (the approval of Elyra's key)", () => {
  it("uses the SDK's domain: its USD-transfer vector signs identically under it", async () => {
    /* The SDK has no approveAgent vector; usdSend shares its domain and
       signature chain, so this proves the domain the approval is signed in. */
    const { domain } = approveAgentTypedData(approveAgentAction("0x0000000000000000000000000000000000000001", 0, "testnet"));
    const signature = await privateKeyToAccount(KEY).signTypedData({
      domain: { ...domain, verifyingContract: domain.verifyingContract as `0x${string}` },
      types: {
        "HyperliquidTransaction:UsdSend": [
          { name: "hyperliquidChain", type: "string" },
          { name: "destination", type: "string" },
          { name: "amount", type: "string" },
          { name: "time", type: "uint64" },
        ],
      },
      primaryType: "HyperliquidTransaction:UsdSend",
      message: { hyperliquidChain: "Testnet", destination: "0x5e9ee1089755c3435139848e47e6635505d5a13a", amount: "1", time: BigInt(1687816341423) },
    });
    expectSignature(
      splitSignature(signature),
      "0x637b37dd731507cdd24f46532ca8ba6eec616952c56218baeff04144e4a77073",
      "0x11a6a24900e6e314136d2592e2f8d502cd89b7c15b198e1bee043c9589f9fad7",
      27,
    );
  });

  it("asks the wallet to approve exactly one named key, on the configured network", () => {
    const typed = approveAgentTypedData(approveAgentAction("0xabc0000000000000000000000000000000000001", 42, "mainnet"));
    expect(typed.primaryType).toBe("HyperliquidTransaction:ApproveAgent");
    expect(typed.message).toEqual({ hyperliquidChain: "Mainnet", agentAddress: "0xabc0000000000000000000000000000000000001", agentName: "Elyra", nonce: 42 });
  });
});

describe("Hyperliquid number formats", () => {
  it("writes numbers the way the SDK does", () => {
    expect(toWire(100)).toBe("100");
    expect(toWire(0.0147)).toBe("0.0147");
    expect(toWire("1670.10")).toBe("1670.1");
    expect(toWire(-0)).toBe("0");
    expect(() => toWire(0.000000001)).toThrow(/round/);
  });

  it("rounds a perp price to five significant figures within the coin's decimals", () => {
    expect(roundPerpPrice(74123.456, 5)).toBe("74123");
    expect(roundPerpPrice(3456.789, 4)).toBe("3456.8");
    expect(roundPerpPrice(1.234567, 1)).toBe("1.2346");
    expect(roundPerpPrice(0.0123456, 0)).toBe("0.012346");
  });

  it("floors a size to the coin's decimals and refuses one that floors to nothing", () => {
    expect(floorSize(0.123456, 3)).toBe("0.123");
    expect(floorSize(2.9999, 2)).toBe("2.99");
    expect(floorSize(0.0004, 3)).toBeNull();
  });
});
