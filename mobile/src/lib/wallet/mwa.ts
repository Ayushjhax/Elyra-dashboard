import * as SecureStore from "expo-secure-store";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { transact, type AuthorizationResult, type MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol";

/* ---------------------------------------------------------------------------
   Mobile Wallet Adapter — the phone's wallet app (Seed Vault on a Seeker,
   Phantom, Solflare…) signing for Elyra.

   Android only, and only in a development or release build: MWA talks to the
   wallet app over a local association, which Expo Go does not include.

   The wallet's authorization token is kept in the device's secure storage
   so the next signature reauthorizes silently instead of asking the person
   to connect again. It is forgotten on sign-out.

   Addresses: MWA speaks base64 public keys; Solana and Privy speak base58.
   Converted here, at the edge, and nowhere else.
--------------------------------------------------------------------------- */

/** What the wallet app shows the person when Elyra asks. The icon is relative to the uri. */
export const APP_IDENTITY = {
  name: "Elyra",
  uri: "https://getelyra.xyz",
  icon: "favicon.ico",
} as const;

export const MWA_CHAIN = "solana:mainnet";

const TOKEN_KEY = "elyra.mwa.authToken";
const ADDRESS_KEY = "elyra.mwa.address";

export function base64ToBase58(address: string): string {
  return bs58.encode(Buffer.from(address, "base64"));
}

export function base58ToBase64(address: string): string {
  return Buffer.from(bs58.decode(address)).toString("base64");
}

export async function storedWalletAddress(): Promise<string | null> {
  return SecureStore.getItemAsync(ADDRESS_KEY);
}

async function remember(result: AuthorizationResult): Promise<string> {
  const account = result.accounts[0];
  if (account === undefined) throw new Error("The wallet app did not share an account.");
  const address = base64ToBase58(account.address);
  await SecureStore.setItemAsync(TOKEN_KEY, result.auth_token);
  await SecureStore.setItemAsync(ADDRESS_KEY, address);
  return address;
}

/** Forgets the wallet authorization — on sign-out, or when the wallet revokes it. */
export async function forgetWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ADDRESS_KEY);
}

/**
 * Opens a session with the wallet app, authorized: silently with the saved
 * token when it is still good, otherwise by asking the person to connect.
 * Returns the authorized address (base58) alongside the callback's result.
 */
export async function withWallet<T>(
  work: (wallet: MobileWallet, address: string, account: AuthorizationResult["accounts"][number]) => Promise<T>,
): Promise<{ address: string; result: T }> {
  return transact(async (wallet) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    let authorization: AuthorizationResult | null = null;
    if (token !== null) {
      try {
        authorization = await wallet.reauthorize({ auth_token: token, identity: APP_IDENTITY });
      } catch {
        /* Expired or revoked by the wallet: ask again rather than fail. */
        authorization = null;
      }
    }
    authorization ??= await wallet.authorize({ chain: MWA_CHAIN, identity: APP_IDENTITY });
    const address = await remember(authorization);
    const account = authorization.accounts[0]!;
    return { address, result: await work(wallet, address, account) };
  });
}

/**
 * The 64-byte signature out of what signMessages returns. The protocol hands
 * back the signed payload; wallets return either the bare signature or the
 * message with the signature appended, so both are read.
 */
export function signatureFrom(signed: Uint8Array, message: Uint8Array): Uint8Array {
  if (signed.length === 64) return signed;
  if (signed.length === message.length + 64) return signed.slice(message.length);
  throw new Error("The wallet returned a signature Elyra could not read.");
}
