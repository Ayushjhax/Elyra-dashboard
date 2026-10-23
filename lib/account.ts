/* ---------------------------------------------------------------------------
   An account's sign-in method, in the words a person would use.

   Client-safe and pure: the rail's account menu, the wallet drawer and the
   Dashboard's account card all name the method the same way from here.
--------------------------------------------------------------------------- */

/**
 * One entry in the account card.
 *
 * Flattened to strings here rather than passed through as Privy's union, so
 * a component rendering it does not have to narrow fifteen account types —
 * and so the rest of the app still knows nothing about Privy's model beyond
 * the provider that fills it in.
 */
export interface LinkedAccountSummary {
  /** Privy's own `LinkedAccountType`: "wallet", "email", "google_oauth"… */
  type: string;
  /** The address, handle or email. Null when Privy exposes none. */
  detail: string | null;
  /** Wallets only: "solana", "ethereum". */
  chainType: string | null;
  /** Wallets only. "privy" means an embedded wallet, which can be exported. */
  walletClientType: string | null;
  /** ISO. When this account was most recently used to log in or link. */
  latestVerifiedAt: string | null;
  /**
   * ISO. When Privy verified this account — an email or phone it sent a code
   * to, a wallet that signed its message. Null when Privy reports none, and
   * then nothing in the UI may call the account verified.
   */
  verifiedAt: string | null;
}

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
export function accountKey(auth: {
  ready: boolean;
  authenticated: boolean;
  account: { id: string } | null;
  solanaAddress: string | null;
}): string | null {
  if (!auth.ready || !auth.authenticated) return null;
  return auth.account?.id ?? auth.solanaAddress ?? "";
}

/* ---------------------------------------------------------------------------
   A Privy user, as Elyra reads it.

   The website's Privy SDK and the Android app's hand back the same facts in
   two shapes — camelCase with Dates on the web, snake_case with epoch
   seconds in Expo. Both are read here, so the two apps cannot disagree about
   which wallet is the account's: the FIRST linked Solana wallet, which is
   also the one the server builds every transaction for (lib/auth/session.ts).
--------------------------------------------------------------------------- */

export interface ElyraAccount {
  /** The Privy DID. */
  id: string;
  createdAt: string | null;
  accounts: LinkedAccountSummary[];
  /**
   * The account most recently used to sign in.
   *
   * Privy does not publish "the method used for this session" directly, but
   * it does record `latestVerifiedAt` per account and documents it as the
   * last time that account was used as a login or link method. The newest
   * one is therefore how the user got here — a reading of a documented
   * field, not an inference from the shape of the data.
   */
  loginMethod: LinkedAccountSummary | null;
  /** The Solana address is a Privy embedded wallet, so it can be exported. */
  solanaIsEmbedded: boolean;
}

export interface UserSummary {
  account: ElyraAccount;
  /** The first linked Solana wallet — what the server builds for. */
  solanaAddress: string | null;
  /** The first linked EVM wallet, for the Hyperliquid read. */
  walletAddress: string | null;
}

type Raw = Record<string, unknown>;

function field(raw: Raw, camel: string, snake: string): unknown {
  return raw[camel] ?? raw[snake];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A Date, an ISO string, or epoch seconds/milliseconds, as ISO — or null. */
export function toIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    /* Privy's REST shape is in seconds; a JavaScript time is in milliseconds. */
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** What to show for an account: its address, number, handle or email. */
function describeAccount(raw: Raw): string | null {
  for (const key of ["address", "number", "username", "email", "name", "subject"]) {
    const value = text(raw[key]);
    if (value !== null) return value;
  }
  return null;
}

export function summariseUser(user: Raw & { id: string }): UserSummary {
  const linkedRaw = field(user, "linkedAccounts", "linked_accounts");
  const raws = (Array.isArray(linkedRaw) ? linkedRaw : []) as Raw[];

  const accounts: LinkedAccountSummary[] = raws.map((raw) => ({
    type: text(raw.type) ?? "unknown",
    detail: describeAccount(raw),
    chainType: text(field(raw, "chainType", "chain_type")),
    walletClientType: text(field(raw, "walletClientType", "wallet_client_type")),
    latestVerifiedAt: toIso(field(raw, "latestVerifiedAt", "latest_verified_at")),
    verifiedAt: toIso(field(raw, "verifiedAt", "verified_at")),
  }));

  /* Each chain picked explicitly from the linked accounts, never Privy's
     "primary" wallet — the EVM address in particular is what Hyperliquid is
     keyed by and is not interchangeable. */
  const addressFor = (chain: string) =>
    accounts.find((entry) => entry.type === "wallet" && entry.chainType === chain)?.detail ?? null;
  const solanaAddress = addressFor("solana");

  /* Accounts with no timestamp are excluded rather than sorted to the front:
     "never verified" must not outrank a real login. */
  const loginMethod =
    accounts
      .filter((entry): entry is LinkedAccountSummary & { latestVerifiedAt: string } => entry.latestVerifiedAt !== null)
      .sort((a, b) => (a.latestVerifiedAt < b.latestVerifiedAt ? 1 : -1))[0] ?? null;

  return {
    account: {
      id: user.id,
      createdAt: toIso(field(user, "createdAt", "created_at")),
      accounts,
      loginMethod,
      /* "privy" is the embedded-wallet client. Only an embedded wallet has a
         key Privy can show the user, so this gates Export. */
      solanaIsEmbedded: accounts.some(
        (entry) =>
          entry.type === "wallet" &&
          entry.chainType === "solana" &&
          entry.detail === solanaAddress &&
          entry.walletClientType === "privy",
      ),
    },
    solanaAddress,
    walletAddress: addressFor("ethereum"),
  };
}
