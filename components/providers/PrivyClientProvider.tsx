"use client";

import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useSolanaFundingPlugin,
} from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { mainnet, robinhood } from "viem/chains";
import { PRIVY_MODAL_ACCENT, PRIVY_MODAL_THEME } from "@/lib/brand";
import { PRIVY_APP_ID_LENGTH, publicEnv } from "@/lib/env";
import { summariseUser, type ElyraAccount, type LinkedAccountSummary } from "@/lib/account";

/* Built once at module scope: rebuilding it per render would hand
   PrivyProvider a new config object every time and remount the connectors. */
const solanaConnectors = toSolanaWalletConnectors();

/**
 * The RPC Privy's own Solana wallet-standard hooks reach for.
 *
 * `useSignTransaction` and the rest of `@privy-io/react-auth/solana` need an
 * RPC directly from the browser for their own signing/simulation flow —
 * unrelated to and unreachable from this app's server-side `SOLANA_RPC_URL`.
 * With nothing configured here they throw "No RPC configuration found for
 * chain solana:mainnet" the first time a dialog tries to sign, which is a
 * hard crash rather than a degraded feature: React has no component to
 * blame it on, so it takes down the tree above it.
 *
 * `publicEnv.solanaRpcUrl` is `NEXT_PUBLIC_`, which `SOLANA_RPC_URL` — the
 * paid endpoint this app's own balance reads use — deliberately is not; see
 * the note on that field for why exposing this one is the correct call.
 *
 * Devnet and testnet are filled in with Solana's standard public endpoints
 * rather than left out. This app only ever expects mainnet — `EXPECTED_CLUSTER`
 * in lib/solana/cluster.ts — but Privy's own hook throws the same way for
 * ANY chain with no entry, and a wallet that ever reports a different chain
 * should hit that as a warning banner elsewhere in the app, not this crash.
 *
 * Deliberately NOT branded with kit's `mainnet()`/`devnet()`/`testnet()`
 * helpers. Branding narrows `createSolanaRpc`'s return type to exactly that
 * cluster's method set — which for mainnet EXCLUDES `requestAirdrop`, since
 * airdrops only exist on a test cluster — but Privy's own declared type for
 * this config wants the same, broader shape (including `requestAirdrop`) for
 * every entry. A plain, unbranded URL string keeps the return type at that
 * broader shape, which costs nothing at runtime since nothing here ever
 * calls `requestAirdrop` against the mainnet entry.
 *
 * Built once at module scope, for the same reason `solanaConnectors` is: a
 * fresh object on every render is a fresh `PrivyProvider` config every
 * render.
 */
const solanaRpcs = {
  "solana:mainnet": {
    rpc: createSolanaRpc(publicEnv.solanaRpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(
      publicEnv.solanaRpcUrl.replace(/^http/, "ws"),
    ),
  },
  "solana:devnet": {
    rpc: createSolanaRpc("https://api.devnet.solana.com"),
    rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.devnet.solana.com"),
  },
  "solana:testnet": {
    rpc: createSolanaRpc("https://api.testnet.solana.com"),
    rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.testnet.solana.com"),
  },
} as const;

/* ---------------------------------------------------------------------------
   Authentication, as the rest of the app sees it.

   Nothing outside this file calls `usePrivy`. It throws when no PrivyProvider
   is mounted, and this provider deliberately does not mount one when the app
   id is malformed — so a component calling it directly would have to do so
   conditionally, which the rules of hooks forbid. Everything reads
   `useElyraAuth()` instead, which always returns a value and reports
   `available: false` when there is no Privy to talk to.
--------------------------------------------------------------------------- */

/* One entry in the account card — defined in lib/account.ts, which the
   Android app shares. */
export type { LinkedAccountSummary };

export type { ElyraAccount };

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
    /* Which wallet is the account's, and how it signed in — read by the same
       function the Android app uses (lib/account.ts). */
    const summary =
      privy.user === null || privy.user === undefined
        ? null
        : summariseUser(privy.user as unknown as Parameters<typeof summariseUser>[0]);

    return {
      available: true,
      ready: privy.ready,
      authenticated: privy.authenticated,
      walletAddress: summary?.walletAddress ?? null,
      solanaAddress: summary?.solanaAddress ?? null,
      login: () => privy.login(),
      logout: () => privy.logout(),
      getAccessToken: () => privy.getAccessToken(),
      account: summary?.account ?? null,
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

           The EVM wallet is also the one Ethereum and Robinhood Chain
           balances are read at, and the one sends and swaps on those chains
           are signed with (components/wallet/EvmDialogs.tsx). */
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" },
        },

        /* Without this, every Solana wallet-standard hook — signing a
           transfer or a swap included — throws the moment it is called. */
        solana: { rpcs: solanaRpcs },

        /* The EVM networks the embedded wallet may sign for. Privy refuses
           to sign a transaction whose chain is not listed here, and Robinhood
           Chain is not among its defaults. The server fixes every field of
           what is signed (nonce, gas, fees), so Privy is never asked to fill
           one in (lib/evm/tx.ts). Typed-data signing, which the Hyperliquid
           approval uses, is not limited by this list. */
        defaultChain: mainnet,
        supportedChains: [mainnet, robinhood],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
