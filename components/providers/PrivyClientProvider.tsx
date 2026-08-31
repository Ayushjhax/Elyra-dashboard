"use client";

import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { PRIVY_MODAL_ACCENT, PRIVY_MODAL_THEME } from "@/lib/brand";
import { PRIVY_APP_ID_LENGTH, publicEnv } from "@/lib/env";

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
  walletAddress: string | null;
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

  const value = useMemo<ElyraAuth>(
    () => ({
      available: true,
      ready: privy.ready,
      authenticated: privy.authenticated,
      walletAddress: privy.user?.wallet?.address ?? null,
      login: () => privy.login(),
      logout: () => privy.logout(),
      getAccessToken: () => privy.getAccessToken(),
    }),
    [privy],
  );

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
        /* An embedded wallet gives every user an EVM address without asking
           them to bring one. That address is what the Hyperliquid portfolio
           source keys on, and it is read-only here — this pass signs nothing
           and sends no transaction. */
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
