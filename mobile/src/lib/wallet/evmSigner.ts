import { useCallback, useMemo } from "react";
import { useEmbeddedEthereumWallet } from "@privy-io/expo";
import { isEvmAddress } from "@/lib/evm/chains";
import type { EvmTxRequest } from "@/lib/evm/wire";
import { apiUrl, authHeaders } from "~/lib/api";
import { useElyraAuth } from "~/lib/auth/AuthProvider";

/* ---------------------------------------------------------------------------
   Signing on Ethereum and Robinhood Chain — the account's embedded EVM
   wallet, through Privy's Expo SDK.

   The website's rule, kept: the server builds every transaction with every
   field fixed and seals it (lib/evm/tx.ts), this wallet signs it WITHOUT
   broadcasting (`eth_signTransaction`, which hands back the signed bytes),
   and the server checks the signer and every field against what it built
   before it sends anything. The app never builds or edits a transaction.

   Only the embedded wallet signs here. Mobile Wallet Adapter speaks Solana
   alone, and a linked external EVM wallet is used from its own app — the
   screens say so rather than offering a button that cannot work.

   Privy's embedded wallet signs without a prompt of its own, so the screen
   in front of this is the confirmation: it shows the amount, the network
   and the whole address before anything here is called.
--------------------------------------------------------------------------- */

const hex = (value: string | number): string => `0x${BigInt(value).toString(16)}`;

export interface EvmSigner {
  /** The session's EVM address, when the embedded wallet holds its key. */
  address: string | null;
  /** Signs a server-built transaction; resolves to the signed transaction. */
  sign: (tx: EvmTxRequest) => Promise<string>;
}

export function useEvmSigner(): EvmSigner {
  const auth = useElyraAuth();
  const { wallets } = useEmbeddedEthereumWallet();
  const session = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  const wallet = useMemo(
    () => (session === null ? undefined : wallets.find((entry) => entry.address.toLowerCase() === session.toLowerCase())),
    [wallets, session],
  );

  const sign = useCallback(
    async (tx: EvmTxRequest): Promise<string> => {
      if (wallet === undefined) throw new Error("This account's EVM wallet is not Elyra's embedded wallet, so it cannot sign here.");
      if (wallet.address.toLowerCase() !== tx.from.toLowerCase()) {
        throw new Error("This transaction was built for a different wallet than the one signed in.");
      }
      const provider = await wallet.getProvider();
      const signed: unknown = await provider.request({
        method: "eth_signTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            value: hex(tx.value),
            data: tx.data,
            chainId: tx.chainId,
            nonce: tx.nonce,
            gasLimit: hex(tx.gas),
            maxFeePerGas: hex(tx.maxFeePerGas),
            maxPriorityFeePerGas: hex(tx.maxPriorityFeePerGas),
            type: 2,
          },
        ],
      });
      if (typeof signed !== "string" || !signed.startsWith("0x")) throw new Error("The wallet did not return a signed transaction.");
      return signed;
    },
    [wallet],
  );

  return { address: wallet === undefined ? null : wallet.address, sign };
}

/**
 * A `fetch`-shaped call to Elyra's API with the session's bearer — the shape
 * the shared `runEvmTx` takes. The app talks to nothing else.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await authHeaders("application/json");
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...headers, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}
