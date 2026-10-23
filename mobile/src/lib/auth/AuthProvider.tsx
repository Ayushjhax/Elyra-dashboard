import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/expo";
import { PrivyElements } from "@privy-io/expo/ui";
import { accountKey, summariseUser, type ElyraAccount } from "@/lib/account";
import { accountLeft, onAccountLeave } from "~/lib/auth/accountChange";
import { onUnauthorized, setTokenGetter } from "~/lib/api";
import { setAccount } from "~/lib/session";
import { endConversation } from "~/lib/agentChat";
import { forgetWallet } from "~/lib/wallet/mwa";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The session, for the whole app.

   Privy holds the session (in the device's secure storage) and restores it
   on launch. This turns it into the same shape the website uses
   (`ElyraAuth`), so screens ported from the web read it the same way, and
   it is the one place that:

     - hands the API client its token getter;
     - publishes who is signed in (lib/session.ts), which resets every
       account store when it changes;
     - runs the clean-up when an account leaves (lib/auth/accountChange.ts);
     - signs the person out cleanly when the API says the token is no
       longer good, and says why.

   Embedded Solana wallets are created for accounts that sign in without a
   wallet of their own — the website's "users-without-wallets".
--------------------------------------------------------------------------- */

export interface ElyraAuth {
  /** Privy is configured for this build. */
  available: boolean;
  /** Privy has finished restoring any existing session. */
  ready: boolean;
  authenticated: boolean;
  /** The first linked Solana wallet — what the server builds for. */
  solanaAddress: string | null;
  /** The first linked EVM wallet, for the Hyperliquid read. */
  walletAddress: string | null;
  account: ElyraAccount | null;
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  /** Privy could not start — storage unreadable, the app ID refused. */
  startError: string | null;
  /** Why the last session ended, when it was not the person's own choice. */
  endedReason: string | null;
  clearEndedReason: () => void;
}

const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
const CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";

const UNAVAILABLE: ElyraAuth = {
  available: false,
  ready: true,
  authenticated: false,
  solanaAddress: null,
  walletAddress: null,
  account: null,
  getAccessToken: async () => null,
  logout: async () => {},
  startError: null,
  endedReason: "Sign-in is not configured in this build (EXPO_PUBLIC_PRIVY_APP_ID).",
  clearEndedReason: () => {},
};

const AuthContext = createContext<ElyraAuth>(UNAVAILABLE);

export function useElyraAuth(): ElyraAuth {
  return useContext(AuthContext);
}

/* What every account change clears, registered once for the app's life. */
onAccountLeave(() => endConversation());
onAccountLeave(() => forgetWallet());

function Bridge({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const [endedReason, setEndedReason] = useState<string | null>(null);

  const summary = useMemo(
    () => (privy.user === null ? null : summariseUser(privy.user as unknown as Parameters<typeof summariseUser>[0])),
    [privy.user],
  );

  const auth = useMemo<ElyraAuth>(
    () => ({
      available: true,
      ready: privy.isReady,
      authenticated: privy.isReady && privy.user !== null,
      solanaAddress: summary?.solanaAddress ?? null,
      walletAddress: summary?.walletAddress ?? null,
      account: summary?.account ?? null,
      getAccessToken: () => privy.getAccessToken(),
      logout: async () => {
        const leaving = accountKey({ ready: privy.isReady, authenticated: privy.user !== null, account: summary?.account ?? null, solanaAddress: summary?.solanaAddress ?? null });
        if (leaving !== null) await accountLeft(leaving);
        await privy.logout();
      },
      startError: privy.error?.message ?? null,
      endedReason,
      clearEndedReason: () => setEndedReason(null),
    }),
    [privy, summary, endedReason],
  );

  /* The API client asks for the token on every request. */
  const getToken = useRef(auth.getAccessToken);
  useEffect(() => {
    getToken.current = auth.getAccessToken;
  }, [auth.getAccessToken]);
  useEffect(() => setTokenGetter(() => getToken.current()), []);

  /* Who is signed in. A change — out, or to someone else — resets every
     store and runs the clean-up for the account that left. */
  const key = accountKey(auth);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.ready) return;
    const left = previous.current;
    previous.current = key;
    setAccount(key);
    if (left !== null && left !== key) void accountLeft(left);
  }, [auth.ready, key]);

  /* A token the API refuses and Privy cannot refresh: sign out, and say so
     on the sign-in screen rather than failing every screen one by one. */
  const live = useRef({ logout: auth.logout, authenticated: auth.authenticated });
  useEffect(() => {
    live.current = { logout: auth.logout, authenticated: auth.authenticated };
  }, [auth.logout, auth.authenticated]);
  useEffect(
    () =>
      onUnauthorized(() => {
        /* Only a session that exists can end. */
        if (!live.current.authenticated) return;
        setEndedReason("Your session ended. Sign in again to carry on.");
        void live.current.logout();
      }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (APP_ID === "") return <AuthContext.Provider value={UNAVAILABLE}>{children}</AuthContext.Provider>;
  return (
    <PrivyProvider
      appId={APP_ID}
      clientId={CLIENT_ID === "" ? undefined : CLIENT_ID}
      config={{ embedded: { solana: { createOnLogin: "users-without-wallets" } } }}
    >
      <Bridge>{children}</Bridge>
      {/* Privy's own screens — funding (the wallet sheet's Fund wallet) —
          which its UI hooks need mounted. They render nothing until one of
          those flows is opened. */}
      <PrivyElements config={{ appearance: { colorScheme: "dark", accentColor: color.accent as `#${string}` } }} />
    </PrivyProvider>
  );
}
