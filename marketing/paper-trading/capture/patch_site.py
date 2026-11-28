#!/usr/bin/env python3
"""Patches the scratch copy of the site (never the repo) for signed-in screenshots.

- next.config.ts: ignore type errors, alias every @privy-io/react-auth entry
  to a stub so no dialog's hook throws without a PrivyProvider.
- PrivyClientProvider: a fake signed-in account behind NEXT_PUBLIC_FAKE_AUTH=1.
"""
import pathlib, sys

site = pathlib.Path(sys.argv[1])

(site / "privy-stub.tsx").write_text('''"use client";
import React from "react";
const noop = async () => { throw new Error("stub"); };
export const PrivyProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const usePrivy = () => ({ ready: true, authenticated: false, user: null, login() {}, logout: async () => {}, getAccessToken: async () => null });
export const useCreateWallet = () => ({ createWallet: noop });
export const toSolanaWalletConnectors = () => ({});
export const useSolanaFundingPlugin = () => {};
export const useSignTransaction = () => ({ signTransaction: noop });
export const useWallets = () => ({ wallets: [], ready: true });
export const useExportWallet = () => ({ exportWallet: noop });
export const useFundWallet = () => ({ fundWallet: noop });
export const useSignTypedData = () => ({ signTypedData: noop });
export const useSignRawHash = () => ({ signRawHash: noop });
''')

(site / "next.config.ts").write_text('''import type { NextConfig } from "next";
import path from "node:path";

const stub = path.resolve(__dirname, "privy-stub.tsx");
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@privy-io/react-auth$": stub,
      "@privy-io/react-auth/solana$": stub,
      "@privy-io/react-auth/extended-chains$": stub,
    };
    return config;
  },
};
export default nextConfig;
''')

p = site / "components/providers/PrivyClientProvider.tsx"
s = p.read_text()
fake = '''
const FAKE: ElyraAuth = {
  available: true,
  ready: true,
  authenticated: true,
  walletAddress: "0x7a3c9e2b41d05f8e6a91c4b27d3e58f0a6b21c94",
  solanaAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  suiAddress: null,
  suiPublicKey: null,
  createSuiWallet: async () => null,
  login: () => {},
  logout: async () => {},
  getAccessToken: async () => "demo-token",
  account: {
    id: "did:privy:demo",
    createdAt: "2026-11-01T00:00:00.000Z",
    accounts: [],
    loginMethod: null,
    solanaIsEmbedded: true,
  },
};
'''
anchor = "const AuthContext = createContext<ElyraAuth>(UNAVAILABLE);"
assert anchor in s
s = s.replace(anchor, anchor + "\n" + fake, 1)
body = "}) {\n  if (publicEnv.privyAppId.length !== PRIVY_APP_ID_LENGTH) {"
assert body in s
s = s.replace(body, '}) {\n  if (process.env.NEXT_PUBLIC_FAKE_AUTH === "1") return <AuthContext.Provider value={FAKE}>{children}</AuthContext.Provider>;\n  if (publicEnv.privyAppId.length !== PRIVY_APP_ID_LENGTH) {', 1)
p.write_text(s)
print("patched", site)
