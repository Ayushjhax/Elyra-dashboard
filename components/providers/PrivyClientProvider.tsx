"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { PRIVY_MODAL_ACCENT, PRIVY_MODAL_THEME } from "@/lib/brand";
import { PRIVY_APP_ID_LENGTH, publicEnv } from "@/lib/env";

/**
 * The client boundary Privy needs.
 *
 * `app/layout.tsx` is a server component and stays one — this is the only
 * thing wrapping the tree, and it renders `children` straight through, so
 * every page below it keeps whatever server/client split it already had.
 *
 * When the app id is not a well-formed one the provider is skipped rather
 * than mounted, because mounting it throws during render — and during a
 * static prerender that takes down every page in the build, including the
 * ones that never needed a session. `assertServerEnv` has already failed the
 * boot loudly by then, so this is the second line, not the diagnosis.
 *
 * Skipped, the app runs as it did before authentication existed: the
 * dashboard is mock data and needs no session. Only the agent surfaces
 * require one, and they report their own absence.
 */
export function PrivyClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (publicEnv.privyAppId.length !== PRIVY_APP_ID_LENGTH) {
    return <>{children}</>;
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
      {children}
    </PrivyProvider>
  );
}
