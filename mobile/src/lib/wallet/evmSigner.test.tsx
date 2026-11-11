import { renderHook } from "@testing-library/react-native";
import type { EvmTxRequest } from "@/lib/evm/wire";
import { useEvmSigner } from "~/lib/wallet/evmSigner";

/* ---------------------------------------------------------------------------
   Signing on Ethereum and Robinhood Chain.

   The embedded EVM wallet signs exactly the transaction the server built —
   every field passed through, numbers as hex — and nothing for any other
   address. A linked external EVM wallet is no signer at all here.
--------------------------------------------------------------------------- */

const EMBEDDED = "0xAbC0000000000000000000000000000000000001";

const mockRequest = jest.fn(async (_request: unknown) => "0x02f8signed");
let mockWallets: Array<{ address: string; getProvider: () => Promise<{ request: typeof mockRequest }> }> = [];
let mockSession: string | null = EMBEDDED;

jest.mock("@privy-io/expo", () => ({
  useEmbeddedEthereumWallet: () => ({ wallets: mockWallets }),
}));
jest.mock("~/lib/auth/AuthProvider", () => ({
  useElyraAuth: () => ({ walletAddress: mockSession }),
}));
jest.mock("~/lib/api", () => ({ apiUrl: (path: string) => path, authHeaders: async () => ({}) }));

function tx(over: Partial<EvmTxRequest> = {}): EvmTxRequest {
  return {
    chain: "robinhood",
    chainId: 4663,
    from: EMBEDDED,
    to: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    value: "1000000000000000000",
    data: "0x",
    nonce: 3,
    gas: "25200",
    maxFeePerGas: "24204000",
    maxPriorityFeePerGas: "0",
    purpose: "transfer",
    builtAt: 1,
    ...over,
  };
}

beforeEach(() => {
  mockRequest.mockClear();
  mockSession = EMBEDDED;
  mockWallets = [{ address: EMBEDDED.toLowerCase(), getProvider: async () => ({ request: mockRequest }) }];
});

it("signs the server's transaction as built, without broadcasting it", async () => {
  const { result } = await renderHook(() => useEvmSigner());
  expect(result.current.address).toBe(EMBEDDED.toLowerCase());
  await expect(result.current.sign(tx())).resolves.toBe("0x02f8signed");
  expect(mockRequest).toHaveBeenCalledWith({
    method: "eth_signTransaction",
    params: [
      {
        from: EMBEDDED,
        to: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
        value: "0xde0b6b3a7640000",
        data: "0x",
        chainId: 4663,
        nonce: 3,
        gasLimit: "0x6270",
        maxFeePerGas: "0x17152e0",
        maxPriorityFeePerGas: "0x0",
        type: 2,
      },
    ],
  });
});

it("refuses a transaction built for another address", async () => {
  const { result } = await renderHook(() => useEvmSigner());
  await expect(result.current.sign(tx({ from: "0x2222222222222222222222222222222222222222" }))).rejects.toThrow(/different wallet/);
  expect(mockRequest).not.toHaveBeenCalled();
});

it("is no signer when the account's EVM wallet is not the embedded one", async () => {
  mockWallets = [];
  const { result } = await renderHook(() => useEvmSigner());
  expect(result.current.address).toBeNull();
  await expect(result.current.sign(tx())).rejects.toThrow(/not Elyra's embedded wallet/);
});
