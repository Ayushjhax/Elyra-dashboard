import { renderHook } from "@testing-library/react-native";
import { SigningError, useSigners } from "~/lib/wallet/signer";
import { withWallet } from "~/lib/wallet/mwa";

/* ---------------------------------------------------------------------------
   Which wallet signs, and when it refuses.

   The server names the address it built for; only the wallet holding that
   address may sign. Anything else — an address the account doesn't hold, a
   wallet app connected with a different key, a declined request — must
   end in a SigningError with nothing signed.
--------------------------------------------------------------------------- */

const EMBEDDED = "EmbeddedWa11et1111111111111111111111111111";
const EXTERNAL = "ExternaLWa11et2222222222222222222222222222";

const mockEmbeddedRequest = jest.fn(async () => ({ signedTransaction: new Uint8Array([1, 2, 3]) }));

jest.mock("@privy-io/expo", () => ({
  useEmbeddedSolanaWallet: () => ({
    wallets: [{ address: "EmbeddedWa11et1111111111111111111111111111", getProvider: async () => ({ request: mockEmbeddedRequest }) }],
  }),
}));

jest.mock("~/lib/auth/AuthProvider", () => ({
  useElyraAuth: () => ({
    account: {
      accounts: [
        { type: "wallet", chainType: "solana", detail: "ExternaLWa11et2222222222222222222222222222", walletClientType: "phantom" },
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

    const signed = await signerFor(EMBEDDED).signTransaction("AAAA");
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
    await expect(signerFor(EXTERNAL).signTransaction("AAAA")).rejects.toThrow(/connected with a different address/);
    expect(mockSignTransactions).not.toHaveBeenCalled();
  });

  it("signs through the wallet app when it holds the right key", async () => {
    walletAppConnectedAs(EXTERNAL);
    const { signerFor } = await signers();
    await expect(signerFor(EXTERNAL).signTransaction("AAAA")).resolves.toBe("c2lnbmVk");
    expect(mockSignTransactions).toHaveBeenCalledWith({ payloads: ["AAAA"] });
  });

  it("reports a wallet's own decline as a cancellation, not a fault", async () => {
    mockEmbeddedRequest.mockRejectedValueOnce(new Error("User rejected the request"));
    const { signerFor } = await signers();
    const failure = await signerFor(EMBEDDED).signTransaction("AAAA").catch((error: unknown) => error);
    expect((failure as SigningError).cancelled).toBe(true);
  });
});
