"use client";

import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
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
};

const AuthContext = createContext<ElyraAuth>(UNAVAILABLE);

export function useElyraAuth(): ElyraAuth {
  return useContext(AuthContext);
}

/** Lives inside PrivyProvider, so `usePrivy` is safe here and only here. */
function PrivyBridge({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();

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

    return {
      available: true,
      ready: privy.ready,
      authenticated: privy.authenticated,
      walletAddress: addressFor("ethereum"),
      solanaAddress: addressFor("solana"),
      login: () => privy.login(),
      logout: () => privy.logout(),
      getAccessToken: () => privy.getAccessToken(),
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
