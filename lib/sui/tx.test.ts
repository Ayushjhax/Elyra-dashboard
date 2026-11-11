import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex, toBase58, toBase64, toHex } from "@mysten/sui/utils";

vi.mock("server-only", () => ({}));

const execute = vi.fn();
vi.mock("@/lib/sui/client", () => ({ suiClient: () => ({ executeTransaction: execute }) }));

const { suiPublicKeyFor } = await import("@/lib/sui/keys");
const { sealSuiWith, suiSigningHash, verifyAndExecuteSui, SUI_BUILD_TTL_MS } = await import("@/lib/sui/tx");

/* ---------------------------------------------------------------------------
   The Sui submit path: a sealed build, a signature over its hash, and the
   checks between them — the only way funds move on Sui.

   The bytes stand in for a transaction; nothing here decodes them. What is
   checked is that the signature Privy would return (a raw Ed25519 signature
   over the 32-byte hash this server computed) verifies against the bytes and
   the session's address, and that anything else is refused before Sui sees it.
--------------------------------------------------------------------------- */

const KEY = Buffer.alloc(32, 7);
const NOW = 1_800_000_000_000;
const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
const ADDRESS = keypair.getPublicKey().toSuiAddress();
const RAW_KEY = keypair.getPublicKey().toRawBytes();

function built(over: Partial<{ sender: string; builtAt: number; bytes: string }> = {}) {
  const tx = { bytes: toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), sender: ADDRESS, purpose: "transfer" as const, builtAt: NOW - 1_000, ...over };
  return { tx, seal: sealSuiWith(KEY, tx) };
}

async function signed(bytes: string): Promise<string> {
  /* What Privy's signRawHash does: Ed25519 over the hash, nothing more. */
  const hash = suiSigningHash(Uint8Array.from(Buffer.from(bytes, "base64")));
  return toHex(await keypair.sign(fromHex(hash.slice(2))));
}

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ $kind: "Transaction", Transaction: { digest: "Dig9", status: { success: true } } });
});

describe("suiPublicKeyFor", () => {
  it("finds the key however it is spelled, and only when it is this address's", () => {
    expect(suiPublicKeyFor(toHex(RAW_KEY), ADDRESS)?.toSuiAddress()).toBe(ADDRESS);
    expect(suiPublicKeyFor(`0x${toHex(RAW_KEY)}`, ADDRESS)?.toSuiAddress()).toBe(ADDRESS);
    expect(suiPublicKeyFor(toBase64(RAW_KEY), ADDRESS)?.toSuiAddress()).toBe(ADDRESS);
    expect(suiPublicKeyFor(toBase58(RAW_KEY), ADDRESS)?.toSuiAddress()).toBe(ADDRESS);
    expect(suiPublicKeyFor(toBase64(new Uint8Array([0, ...RAW_KEY])), ADDRESS)?.toSuiAddress()).toBe(ADDRESS);
    expect(suiPublicKeyFor(toHex(RAW_KEY), `0x${"d".repeat(64)}`)).toBeNull();
    expect(suiPublicKeyFor("", ADDRESS)).toBeNull();
    expect(suiPublicKeyFor(null, ADDRESS)).toBeNull();
  });
});

describe("verifyAndExecuteSui", () => {
  const base = async (over: Partial<Parameters<typeof verifyAndExecuteSui>[0]> = {}) => {
    const { tx, seal } = built();
    return verifyAndExecuteSui({
      tx,
      seal,
      signature: await signed(tx.bytes),
      publicKeys: [null, toBase64(RAW_KEY)],
      sessionAddress: ADDRESS,
      now: NOW,
      key: KEY,
      ...over,
    });
  };

  it("executes a fresh, sealed transaction signed by the session's wallet", async () => {
    await expect(base()).resolves.toEqual({ ok: true, digest: "Dig9" });
    expect(execute).toHaveBeenCalledTimes(1);
    const [call] = execute.mock.calls[0] as [{ signatures: string[] }];
    expect(call.signatures).toHaveLength(1);
  });

  it("refuses bytes it did not seal, or sealed for another sender", async () => {
    const { tx } = built();
    await expect(base({ tx: { ...tx, bytes: toBase64(new Uint8Array([9, 9, 9])) } })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/not built by Elyra/) });
    await expect(base({ seal: "0".repeat(64) })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/not built by Elyra/) });
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a stale build, and one for a wallet other than the session's", async () => {
    await expect(base({ now: NOW + SUI_BUILD_TTL_MS + 1 })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/too long ago/) });
    await expect(base({ sessionAddress: `0x${"d".repeat(64)}` })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/different Sui wallet/) });
    await expect(base({ sessionAddress: null })).resolves.toMatchObject({ ok: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a signature over anything else, or with no key that derives to the address", async () => {
    const other = await signed(toBase64(new Uint8Array([8, 7, 6])));
    await expect(base({ signature: other })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    await expect(base({ signature: "zz" })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/not a signature/) });
    const stranger = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(3)).getPublicKey().toRawBytes();
    await expect(base({ publicKeys: [toBase64(stranger)] })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/public key/) });
    expect(execute).not.toHaveBeenCalled();
  });

  it("says plainly when the transaction landed and failed", async () => {
    execute.mockResolvedValue({ $kind: "FailedTransaction", FailedTransaction: { digest: "Dig0", status: { success: false, error: { message: "InsufficientCoinBalance" } } } });
    await expect(base()).resolves.toMatchObject({ ok: false, digest: "Dig0", error: expect.stringMatching(/InsufficientCoinBalance/) });
  });
});
