import { renderHook } from "@testing-library/react-native";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { SigningError, useSigners } from "~/lib/wallet/signer";
import { withWallet } from "~/lib/wallet/mwa";

/* ---------------------------------------------------------------------------
   Which wallet signs, and when it refuses.

   The server names the address it built for; only the wallet holding that
   address may sign. Anything else — an address the account doesn't hold, a
   wallet app connected with a different key, a declined request — must
   end in a SigningError with nothing signed.
--------------------------------------------------------------------------- */

const EMBEDDED = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const EXTERNAL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

const mockEmbeddedRequest = jest.fn(async () => ({ signedTransaction: new Uint8Array([1, 2, 3]) }));

jest.mock("@privy-io/expo", () => ({
  useEmbeddedSolanaWallet: () => ({
    wallets: [{ address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", getProvider: async () => ({ request: mockEmbeddedRequest }) }],
  }),
}));

jest.mock("~/lib/auth/AuthProvider", () => ({
  useElyraAuth: () => ({
    account: {
      accounts: [
        { type: "wallet", chainType: "solana", detail: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", walletClientType: "phantom" },
      ],
    },
  }),
}));

jest.mock("@solana-mobile/mobile-wallet-adapter-protocol", () => ({ transact: jest.fn() }));
jest.mock("expo-secure-store", () => ({}));
jest.mock("~/lib/wallet/mwa", () => ({
  ...jest.requireActual("~/lib/wallet/mwa"),
  withWallet: jest.fn(),
}));

const mockSignTransactions = jest.fn(async () => ({ signed_payloads: ["c2lnbmVk"] }));

/** The smallest legacy transaction that asks `signer` alone to sign. */
function unsignedFor(signer: string): string {
  return Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from([1, 0, 0, 1]),
    Buffer.from(bs58.decode(signer)),
    Buffer.alloc(32),
    Buffer.from([0]),
  ]).toString("base64");
}
const FOR_EMBEDDED = unsignedFor(EMBEDDED);
const FOR_EXTERNAL = unsignedFor(EXTERNAL);

/** The phone's wallet app, connected with `connected`. */
function walletAppConnectedAs(connected: string) {
  jest.mocked(withWallet).mockImplementation(async (work) => ({
    address: connected,
    result: await work({ signTransactions: mockSignTransactions } as never, connected, {} as never),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function signers() {
  const view = await renderHook(() => useSigners());
  return view.result.current;
}

describe("choosing the signer", () => {
  it("lists the embedded wallet and the linked external one", async () => {
    const { signers: list } = await signers();
    expect(list.map((entry) => [entry.kind, entry.address])).toEqual([
      ["embedded", EMBEDDED],
      ["external", EXTERNAL],
    ]);
  });

  it("signs with the wallet whose address the server built for", async () => {
    const { signerFor } = await signers();
    expect(signerFor(EMBEDDED).kind).toBe("embedded");
    expect(signerFor(EXTERNAL).kind).toBe("external");

    const signed = await signerFor(EMBEDDED).signTransaction(FOR_EMBEDDED);
    expect(signed).toBe("AQID");
    expect(mockEmbeddedRequest).toHaveBeenCalledTimes(1);
  });
});

describe("refusing", () => {
  it("refuses an address the account does not hold, before anything is signed", async () => {
    const { signerFor } = await signers();
    expect(() => signerFor("SomeoneE1se33333333333333333333333333333333")).toThrow(SigningError);
    expect(() => signerFor("SomeoneE1se33333333333333333333333333333333")).toThrow(/not a wallet on this account/);
    expect(mockEmbeddedRequest).not.toHaveBeenCalled();
    expect(withWallet).not.toHaveBeenCalled();
  });

  it("refuses when the wallet app is connected with a different key, without showing it the bytes", async () => {
    walletAppConnectedAs(EMBEDDED);
    const { signerFor } = await signers();
    await expect(signerFor(EXTERNAL).signTransaction(FOR_EXTERNAL)).rejects.toThrow(/connected with a different address/);
    expect(mockSignTransactions).not.toHaveBeenCalled();
  });

  it("signs through the wallet app when it holds the right key", async () => {
    walletAppConnectedAs(EXTERNAL);
    const { signerFor } = await signers();
    await expect(signerFor(EXTERNAL).signTransaction(FOR_EXTERNAL)).resolves.toBe("c2lnbmVk");
    expect(mockSignTransactions).toHaveBeenCalledWith({ payloads: [FOR_EXTERNAL] });
  });

  it("refuses bytes built for another wallet before either wallet sees them", async () => {
    walletAppConnectedAs(EXTERNAL);
    const { signerFor } = await signers();
    await expect(signerFor(EMBEDDED).signTransaction(FOR_EXTERNAL)).rejects.toThrow(/not built for this wallet/);
    await expect(signerFor(EXTERNAL).signTransaction(FOR_EMBEDDED)).rejects.toThrow(/not built for this wallet/);
    await expect(signerFor(EMBEDDED).signTransaction("AAAA")).rejects.toThrow(/could not be read/);
    expect(mockEmbeddedRequest).not.toHaveBeenCalled();
    expect(withWallet).not.toHaveBeenCalled();
  });

  it("reports a wallet's own decline as a cancellation, not a fault", async () => {
    mockEmbeddedRequest.mockRejectedValueOnce(new Error("User rejected the request"));
    const { signerFor } = await signers();
    const failure = await signerFor(EMBEDDED).signTransaction(FOR_EMBEDDED).catch((error: unknown) => error);
    expect((failure as SigningError).cancelled).toBe(true);
  });
});
