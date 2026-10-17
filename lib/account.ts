import type { ElyraAuth, LinkedAccountSummary } from "@/components/providers/PrivyClientProvider";

/* ---------------------------------------------------------------------------
   An account's sign-in method, in the words a person would use.

   Client-safe and pure: the rail's account menu, the wallet drawer and the
   Dashboard's account card all name the method the same way from here.
--------------------------------------------------------------------------- */

/** Privy's account types, by their own names. */
const METHOD_LABEL: Record<string, string> = {
  wallet: "Wallet",
  email: "Email",
  phone: "Phone",
  google_oauth: "Google",
  twitter_oauth: "X",
  discord_oauth: "Discord",
  github_oauth: "GitHub",
  apple_oauth: "Apple",
  linkedin_oauth: "LinkedIn",
  tiktok_oauth: "TikTok",
  spotify_oauth: "Spotify",
  instagram_oauth: "Instagram",
  twitch_oauth: "Twitch",
  line_oauth: "LINE",
  farcaster: "Farcaster",
  telegram: "Telegram",
  passkey: "Passkey",
  smart_wallet: "Smart wallet",
  guest: "Guest",
};

export function methodLabel(type: string): string {
  /* Unknown types render as their raw name with the underscores taken out,
     which is still readable and does not require this table to be complete. */
  return METHOD_LABEL[type] ?? type.replace(/_/g, " ");
}

/** Wallet apps Privy names by `walletClientType`. */
const WALLET_CLIENT: Record<string, string> = {
  phantom: "Phantom",
  solflare: "Solflare",
  backpack: "Backpack",
  metamask: "MetaMask",
  coinbase_wallet: "Coinbase Wallet",
  rainbow: "Rainbow",
  okx_wallet: "OKX Wallet",
  privy: "Elyra",
};

/** The app that holds a wallet's key, or null when Privy does not say. */
export function walletClientName(clientType: string | null): string | null {
  if (clientType === null) return null;
  return WALLET_CLIENT[clientType] ?? null;
}

/**
 * How the person signed in, as a short badge: "Email account",
 * "Phantom wallet", "Google account". Null when the method is not known —
 * then nothing is shown rather than a guess.
 */
export function signInLabel(method: LinkedAccountSummary | null): string | null {
  if (method === null) return null;
  switch (method.type) {
    case "wallet": {
      const client = walletClientName(method.walletClientType);
      return client === null ? "Wallet sign-in" : `${client} wallet`;
    }
    case "passkey":
      return "Passkey";
    case "guest":
      return "Guest account";
    default:
      return `${methodLabel(method.type)} account`;
  }
}

/**
 * Who is signed in, as a key the account stores compare between renders:
 * null while signed out, otherwise the Privy account.
 *
 * Every store that holds one account's data resets when this changes, not
 * only when it goes null — signing out and straight back in as someone else
 * can happen without a render that sees "signed out", and the last account's
 * rows must never be shown under the next one's.
 */
export function accountKey(auth: Pick<ElyraAuth, "ready" | "authenticated" | "account" | "solanaAddress">): string | null {
  if (!auth.ready || !auth.authenticated) return null;
  return auth.account?.id ?? auth.solanaAddress ?? "";
}
