"use client";

import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useSolanaFundingPlugin,
} from "@privy-io/react-auth/solana";
import { PRIVY_MODAL_ACCENT, PRIVY_MODAL_THEME } from "@/lib/brand";
import { PRIVY_APP_ID_LENGTH, publicEnv } from "@/lib/env";

/* Built once at module scope: rebuilding it per render would hand
   PrivyProvider a new config object every time and remount the connectors. */
const solanaConnectors = toSolanaWalletConnectors();

/* ---------------------------------------------------------------------------
   Authentication, as the rest of the app sees it.

   Nothing outside this file calls `usePrivy`. It throws when no PrivyProvider
   is mounted, and this provider deliberately does not mount one when the app
   id is malformed — so a component calling it directly would have to do so
   conditionally, which the rules of hooks forbid. Everything reads
   `useElyraAuth()` instead, which always returns a value and reports
   `available: false` when there is no Privy to talk to.
--------------------------------------------------------------------------- */

/**
 * One entry in the account card.
 *
 * Flattened to strings here rather than passed through as Privy's union, so
 * a component rendering it does not have to narrow fifteen account types —
 * and so the rest of the app still knows nothing about Privy's model beyond
 * this file.
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
}

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

export interface ElyraAuth {
  /** Whether Privy is configured and mounted at all. */
  available: boolean;
  /** Privy has finished restoring any existing session. */
  ready: boolean;
  authenticated: boolean;
  /** EVM, for the Hyperliquid read. */
  walletAddress: string | null;
  /** Solana — this app's native chain, and what the rail displays. */
  solanaAddress: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** The access token to send as a bearer, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Identity and linked accounts, or null when signed out. */
  account: ElyraAccount | null;
}

const UNAVAILABLE: ElyraAuth = {
  available: false,
  /* Ready, not pending: there is nothing to wait for, and a false `ready`
     would leave every consumer showing a spinner forever. */
  ready: true,
  authenticated: false,
  walletAddress: null,
  solanaAddress: null,
  login: () => {},
  logout: async () => {},
  getAccessToken: async () => null,
  account: null,
};

const AuthContext = createContext<ElyraAuth>(UNAVAILABLE);

export function useElyraAuth(): ElyraAuth {
  return useContext(AuthContext);
}

/**
 * The human-readable half of a linked account.
 *
 * Privy's `LinkedAccount` is a union of fifteen shapes with no shared detail
 * field, so this reads the known ones by name in priority order rather than
 * narrowing the union at every call site. `unknown`-typed indexing keeps it
 * honest about the fact that these are optional: an account type that
 * carries none of them reports null, and the UI shows the type alone.
 */
function describeAccount(account: Record<string, unknown>): string | null {
  const keys = [
    "address", // wallet, email
    "number", // phone
    "username", // twitter, discord, github, telegram, tiktok
    "email", // google, apple, linkedin
    "name",
    "subject",
  ];
  for (const key of keys) {
    const value = account[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function toIso(value: unknown): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : null;
}

/** Lives inside PrivyProvider, so `usePrivy` is safe here and only here. */
function PrivyBridge({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();

  /* Registers Privy's Solana funding screens with the provider.

     A registration hook, not a value: it returns void and its whole effect is
     to put the Solana funding flow into the plugin context, so `useFundWallet`
     from `@privy-io/react-auth/solana` has screens to open. Privy tree-shakes
     these flows by default, and without this call the funding modal opens
     empty — which is why `Fund wallet` shipped disabled until now.

     It must be called INSIDE PrivyProvider, which is why it lives in the
     bridge rather than beside the `config` object below. Nothing about the
     provider's configuration changed. */
  useSolanaFundingPlugin();

  const value = useMemo<ElyraAuth>(() => {
    /* `user.wallet` is whichever wallet Privy considers primary, which on a
       Solana-first account is a Solana one. Pick each chain explicitly from
       linkedAccounts instead — the EVM address in particular is not
       interchangeable, since it is what Hyperliquid is keyed by. */
    const wallets = (privy.user?.linkedAccounts ?? []).filter(
      (account): account is typeof account & { address: string; chainType: string } =>
        account.type === "wallet" && "address" in account,
    );

    const addressFor = (chain: string) =>
      wallets.find((wallet) => wallet.chainType === chain)?.address ?? null;

    const solanaAddress = addressFor("solana");

    const linked: LinkedAccountSummary[] = (privy.user?.linkedAccounts ?? []).map(
      (account) => {
        const raw = account as unknown as Record<string, unknown>;
        return {
          type: account.type,
          detail: describeAccount(raw),
          chainType: typeof raw.chainType === "string" ? raw.chainType : null,
          walletClientType:
            typeof raw.walletClientType === "string" ? raw.walletClientType : null,
          latestVerifiedAt: toIso(raw.latestVerifiedAt),
        };
      },
    );

    /* The most recently verified account is the one the user signed in with —
       see the note on `ElyraAccount.loginMethod`. Accounts with no timestamp
       are excluded rather than sorted to the front, since "never verified"
       must not outrank a real login. */
    const loginMethod =
      linked
        .filter(
          (entry): entry is LinkedAccountSummary & { latestVerifiedAt: string } =>
            entry.latestVerifiedAt !== null,
        )
        .sort((a, b) => (a.latestVerifiedAt < b.latestVerifiedAt ? 1 : -1))[0] ?? null;

    const account: ElyraAccount | null =
      privy.user === null || privy.user === undefined
        ? null
        : {
            id: privy.user.id,
            createdAt: toIso(privy.user.createdAt),
            accounts: linked,
            loginMethod,
            /* "privy" is the embedded-wallet client. Only an embedded wallet
               has a key Privy can show the user, so this gates Export. */
            solanaIsEmbedded: linked.some(
              (entry) =>
                entry.type === "wallet" &&
                entry.chainType === "solana" &&
                entry.detail === solanaAddress &&
                entry.walletClientType === "privy",
            ),
          };

    return {
      available: true,
      ready: privy.ready,
      authenticated: privy.authenticated,
      walletAddress: addressFor("ethereum"),
      solanaAddress,
      login: () => privy.login(),
      logout: () => privy.logout(),
      getAccessToken: () => privy.getAccessToken(),
      account,
    };
  }, [privy]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The client boundary Privy needs.
 *
 * `app/layout.tsx` is a server component and stays one — this renders
 * `children` straight through, so every page below keeps its existing
 * server/client split.
 *
 * When the app id is not well-formed the provider is skipped rather than
 * mounted, because mounting it throws during render, and during a static
 * prerender that takes down every page in the build — including ones that
 * never needed a session. `assertServerEnv` has already failed the boot
 * loudly by then, so this is the second line, not the diagnosis.
 *
 * Skipped, the app runs as it did before authentication existed: the
 * dashboard is mock data and needs no session. Only the agent surfaces
 * require one, and they say so rather than failing.
 */
export function PrivyClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (publicEnv.privyAppId.length !== PRIVY_APP_ID_LENGTH) {
    return <AuthContext.Provider value={UNAVAILABLE}>{children}</AuthContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={publicEnv.privyAppId}
      config={{
        appearance: {
          theme: PRIVY_MODAL_THEME,
          accentColor: PRIVY_MODAL_ACCENT,
        },
        /* Solana wallets in the modal. Elyra is a Solana terminal, so this is
           the chain users arrive with — Phantom, Solflare and the rest. */
        externalWallets: { solana: { connectors: solanaConnectors } },

        /* Embedded wallets on both chains, so a user who signs in with email
           still has an address.

           Both, not one: Solana is this app's native chain and what the UI
           shows, but Hyperliquid's portfolio endpoint is keyed by an EVM
           address and there is no Solana equivalent. A Solana-only account
           simply has no Hyperliquid to read, which the portfolio layer
           reports rather than guesses at.

           Read-only either way — this pass signs nothing and sends no
           transaction. */
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
