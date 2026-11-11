import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keccak256, serializeTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkLifiQuote, swapTokenFor, swapTokens } from "@/lib/evm/swap";
import { sealWith, toSerializable, verifySigned, type EvmTxRequest } from "@/lib/evm/tx";

/* Throwaway keys for signing fixtures — never funded, never used anywhere. */
const OWNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const STRANGER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const KEY = createHash("sha256").update("test seal key").digest();
const NOW = 1_800_000_000_000;

function request(over: Partial<EvmTxRequest> = {}): EvmTxRequest {
  return {
    chain: "robinhood",
    chainId: 4663,
    from: OWNER.address,
    to: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    value: "0",
    data: "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000a",
    nonce: 7,
    gas: "60000",
    maxFeePerGas: "20000000",
    maxPriorityFeePerGas: "0",
    purpose: "transfer",
    builtAt: NOW - 5_000,
    ...over,
  };
}

async function signed(tx: EvmTxRequest, account = OWNER) {
  return account.signTransaction(toSerializable(tx));
}

describe("verifySigned", () => {
  it("accepts the built transaction, signed by the session's own key", async () => {
    const tx = request();
    const serialized = await signed(tx);
    const result = await verifySigned({ tx, seal: sealWith(KEY, tx), signed: serialized, sessionAddress: OWNER.address.toLowerCase(), now: NOW, key: KEY });
    expect(result).toEqual({ ok: true, serialized, hash: keccak256(serialized) });
  });

  it("accepts a bare signature over the built transaction", async () => {
    const tx = request();
    const signature = await OWNER.sign({ hash: keccak256(serializeTransaction(toSerializable(tx))) });
    const result = await verifySigned({ tx, seal: sealWith(KEY, tx), signed: signature, sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(result.ok).toBe(true);
  });

  it("refuses a request this server did not seal", async () => {
    const tx = request();
    const forged = request({ to: STRANGER.address });
    const result = await verifySigned({ tx: forged, seal: sealWith(KEY, tx), signed: await signed(forged), sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/not built by Elyra/) });
  });

  it("refuses a signed transaction that differs from the sealed one", async () => {
    const tx = request();
    const swapped = await signed({ ...tx, value: "1000" });
    const result = await verifySigned({ tx, seal: sealWith(KEY, tx), signed: swapped, sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/amount/) });

    const elsewhere = await signed({ ...tx, to: STRANGER.address });
    const moved = await verifySigned({ tx, seal: sealWith(KEY, tx), signed: elsewhere, sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(moved).toMatchObject({ ok: false, error: expect.stringMatching(/destination/) });
  });

  it("refuses another wallet's signature and another session", async () => {
    const tx = request();
    const seal = sealWith(KEY, tx);
    const byStranger = await verifySigned({ tx, seal, signed: await signed(tx, STRANGER), sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(byStranger).toMatchObject({ ok: false, error: expect.stringMatching(/different wallet/) });

    const otherSession = await verifySigned({ tx, seal, signed: await signed(tx), sessionAddress: STRANGER.address, now: NOW, key: KEY });
    expect(otherSession).toMatchObject({ ok: false, error: expect.stringMatching(/different wallet than the one signed in/) });
  });

  it("refuses a stale build and gas caps far above the built ones", async () => {
    const stale = request({ builtAt: NOW - 11 * 60_000 });
    const old = await verifySigned({ tx: stale, seal: sealWith(KEY, stale), signed: await signed(stale), sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(old).toMatchObject({ ok: false, error: expect.stringMatching(/too long ago/) });

    const tx = request();
    const greedy = await signed({ ...tx, maxFeePerGas: "90000000" });
    const fee = await verifySigned({ tx, seal: sealWith(KEY, tx), signed: greedy, sessionAddress: OWNER.address, now: NOW, key: KEY });
    expect(fee).toMatchObject({ ok: false, error: expect.stringMatching(/fee cap/) });
  });
});

describe("EVM swaps", () => {
  const ADDRESS = OWNER.address;
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const NATIVE = "0x0000000000000000000000000000000000000000";

  function quote(over: { action?: Record<string, unknown>; estimate?: Record<string, unknown>; transactionRequest?: Record<string, unknown> } = {}) {
    return {
      tool: "nordstern",
      action: {
        fromChainId: 4663, toChainId: 4663,
        fromToken: { address: NATIVE }, toToken: { address: USDG },
        fromAmount: "10000000000000000", fromAddress: ADDRESS, toAddress: ADDRESS,
        ...over.action,
      },
      estimate: {
        toAmount: "20494053", toAmountMin: "20391583", approvalAddress: "0xB477751B76CF82d00a686A1232f5fCD772414Af3",
        feeCosts: [{ amountUSD: "0.0514", included: true }], gasCosts: [{ amountUSD: "0.0208" }],
        ...over.estimate,
      },
      transactionRequest: {
        chainId: 4663, from: ADDRESS, to: "0xB477751B76CF82d00a686A1232f5fCD772414Af3",
        value: "0x2386f26fc10000", data: "0xabcdef",
        ...over.transactionRequest,
      },
    };
  }
  const want = { chainId: 4663, fromToken: NATIVE, toToken: USDG, fromAmount: "10000000000000000", address: ADDRESS };

  it("accepts a quote that matches the swap asked for", () => {
    const result = checkLifiQuote(quote(), want);
    expect(result).toMatchObject({ ok: true, quote: { value: "10000000000000000", toAmount: "20494053", feeUsd: 0.0514, tool: "nordstern" } });
  });

  it("refuses a quote that pays anyone else, or swaps something else", () => {
    expect(checkLifiQuote(quote({ action: { toAddress: STRANGER.address } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/recipient/) });
    expect(checkLifiQuote(quote({ action: { toToken: { address: STRANGER.address } } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/token bought/) });
    expect(checkLifiQuote(quote({ action: { fromAmount: "1" } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/amount/) });
    expect(checkLifiQuote(quote({ transactionRequest: { chainId: 1 } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/network/) });
    /* Selling ETH must send exactly the amount sold. */
    expect(checkLifiQuote(quote({ transactionRequest: { value: "0x1" } }), want)).toMatchObject({ ok: false, error: expect.stringMatching(/value/) });
    expect(checkLifiQuote({ nope: true }, want)).toMatchObject({ ok: false });
  });

  it("swaps only ETH and listed crypto tokens — never a stock token", () => {
    expect(swapTokens("robinhood").map((token) => token.symbol)).toEqual(["ETH", "WETH", "USDG"]);
    expect(swapTokenFor("robinhood", "usdg")?.address).toBe(USDG);
    expect(swapTokenFor("robinhood", "NVDA")).toBeNull();
    expect(swapTokenFor("ethereum", "USDC")?.decimals).toBe(6);
  });
});
