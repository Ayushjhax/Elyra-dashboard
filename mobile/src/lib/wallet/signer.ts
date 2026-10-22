import { useCallback, useMemo } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { Buffer } from "buffer";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useAppStore } from "~/lib/store";
import { base58ToBase64, signatureFrom, withWallet } from "~/lib/wallet/mwa";

/* ---------------------------------------------------------------------------
   One way to sign, whichever wallet holds the key.

   The server builds every transaction for one address — the `signer` its
   build response names — and the only wallet that may sign it is the one
   holding that address. This finds it among the account's wallets:

     - EMBEDDED: Privy's wallet. Signed WITHOUT sending
       (`signTransaction`), so the signed bytes go back to the API, which
       hands a swap to Jupiter's execute endpoint and a transfer to its own
       confirm loop — nothing here ever submits a transaction.
     - EXTERNAL: the phone's wallet app, through Mobile Wallet Adapter. Also
       sign-only (`signTransactions`).

   If the account holds no wallet with that address, or the wallet app is
   connected with a different one, it refuses and says so — never signs with
   the wrong key, never guesses.

   Every signature is behind the device's own authentication (fingerprint,
   face, or the screen lock) while "Require fingerprint/face to sign" is on,
   which it is by default. A phone with nothing enrolled signs without the
   prompt rather than refusing outright; the setting says so.

   Bytes in and out are base64: the API's format, and MWA's.
--------------------------------------------------------------------------- */

export class SigningError extends Error {
  constructor(
    message: string,
    /** The person declined — not a fault, and said as "Cancelled". */
    readonly cancelled = false,
  ) {
    super(message);
    this.name = "SigningError";
  }
}

export type SignerKind = "embedded" | "external";

export interface Signer {
  kind: SignerKind;
  address: string;
  /** Signs an unsigned transaction the API built. Base64 in, base64 out. Never sends. */
  signTransaction: (unsignedBase64: string) => Promise<string>;
  /** Signs bytes (base64). Returns the 64-byte signature, base64. */
  signMessage: (messageBase64: string) => Promise<string>;
}

/** The device's authentication before a signature, when the setting asks for it. */
export async function confirmBeforeSigning(required: boolean): Promise<void> {
  if (!required) return;
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  /* Nothing to check against: sign without the prompt rather than lock the
     person out of their own wallet. */
  if (!hardware || !enrolled) return;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Confirm to sign with Elyra",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  if (!result.success) {
    throw new SigningError("Cancelled — nothing was signed.", true);
  }
}

function wrongWallet(address: string): SigningError {
  return new SigningError(
    `Your wallet app is connected with a different address. Switch it to ${address.slice(0, 4)}…${address.slice(-4)} and try again. Nothing was signed.`,
  );
}

function cancelledByWallet(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /reject|declin|cancel|denied|closed/i.test(message);
}

/** Every wallet this account can sign with, and the one matching an address. */
export function useSigners(): {
  signers: Signer[];
  signerFor: (address: string) => Signer;
} {
  const auth = useElyraAuth();
  const embedded = useEmbeddedSolanaWallet();
  const requireAuth = useAppStore((state) => state.requireAuthToSign);

  const embeddedWallets = useMemo(() => ("wallets" in embedded ? (embedded.wallets ?? []) : []), [embedded]);

  const signers = useMemo<Signer[]>(() => {
    const list: Signer[] = embeddedWallets.map((wallet) => ({
      kind: "embedded",
      address: wallet.address,
      async signTransaction(unsignedBase64) {
        await confirmBeforeSigning(requireAuth);
        try {
          const provider = await wallet.getProvider();
          const { signedTransaction } = await provider.request({
            method: "signTransaction",
            params: { transaction: new Uint8Array(Buffer.from(unsignedBase64, "base64")) },
          });
          return Buffer.from(signedTransaction).toString("base64");
        } catch (error) {
          if (cancelledByWallet(error)) throw new SigningError("Cancelled — nothing was signed.", true);
          throw new SigningError(error instanceof Error ? error.message : "The embedded wallet could not sign.");
        }
      },
      async signMessage(messageBase64) {
        await confirmBeforeSigning(requireAuth);
        const provider = await wallet.getProvider();
        const { signature } = await provider.request({ method: "signMessage", params: { message: messageBase64 } });
        return signature;
      },
    }));

    /* External Solana wallets linked to this account, signed through the
       phone's wallet app. */
    for (const entry of auth.account?.accounts ?? []) {
      if (entry.type !== "wallet" || entry.chainType !== "solana" || entry.detail === null) continue;
      if (entry.walletClientType === "privy") continue;
      if (list.some((signer) => signer.address === entry.detail)) continue;
      const address = entry.detail;
      list.push({
        kind: "external",
        address,
        async signTransaction(unsignedBase64) {
          await confirmBeforeSigning(requireAuth);
          try {
            const { result } = await withWallet(async (wallet, connected) => {
              /* Checked before the wallet is asked, so a wallet holding a
                 different key is never shown bytes it must not sign. */
              if (connected !== address) throw wrongWallet(address);
              const { signed_payloads } = await wallet.signTransactions({ payloads: [unsignedBase64] });
              return signed_payloads[0];
            });
            if (result === undefined) throw new SigningError("The wallet app returned nothing to send.");
            return result;
          } catch (error) {
            if (error instanceof SigningError) throw error;
            if (cancelledByWallet(error)) throw new SigningError("Cancelled — nothing was signed.", true);
            throw new SigningError(error instanceof Error ? error.message : "The wallet app could not sign.");
          }
        },
        async signMessage(messageBase64) {
          await confirmBeforeSigning(requireAuth);
          const message = new Uint8Array(Buffer.from(messageBase64, "base64"));
          const { result } = await withWallet(async (wallet, connected) => {
            if (connected !== address) throw wrongWallet(address);
            const { signed_payloads } = await wallet.signMessages({
              addresses: [base58ToBase64(address)],
              payloads: [messageBase64],
            });
            return signed_payloads[0];
          });
          if (result === undefined) throw new SigningError("The wallet app returned no signature.");
          return Buffer.from(signatureFrom(new Uint8Array(Buffer.from(result, "base64")), message)).toString("base64");
        },
      });
    }
    return list;
  }, [embeddedWallets, auth.account, requireAuth]);

  const signerFor = useCallback(
    (address: string): Signer => {
      const signer = signers.find((entry) => entry.address === address);
      if (signer === undefined) {
        throw new SigningError(
          `This was prepared for ${address.slice(0, 4)}…${address.slice(-4)}, which is not a wallet on this account. Nothing was signed.`,
        );
      }
      return signer;
    },
    [signers],
  );

  return { signers, signerFor };
}
