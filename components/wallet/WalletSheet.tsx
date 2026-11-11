"use client";

import { useRef } from "react";
import { RefreshCw, Wallet, X } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { IconButton } from "@/components/shell/RouteDrawer";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FundWallet, WalletActions } from "@/components/wallet/WalletActions";
import { EvmWallets } from "@/components/wallet/EvmWallets";
import { SuiWallet } from "@/components/wallet/SuiWallet";
import { WalletAssets, WalletTotal } from "@/components/wallet/WalletBalances";
import { WalletIdentity } from "@/components/wallet/WalletIdentity";
import { WalletSync } from "@/components/wallet/WalletSync";
import { useElyraStore } from "@/lib/store";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The wallet drawer, opened from the rail's account menu, the header's wallet
   menu and the Dashboard.

   A right-side sheet rather than a popover: it holds an address, a token list
   of unbounded length and several actions, which is more than a popover
   should carry and more than one would fit on a phone. It is as tall as what
   is in it and no taller — the header stays put and the body scrolls once it
   meets the viewport — and on a phone it takes the screen's width.

   It reads the same `useWalletDashboard` store as every other balance, so
   the Solana half costs no request: the subscription is reference counted
   and the poll is already running. The Ethereum and Robinhood Chain half
   reads the portfolio store, which polls only while something — this
   drawer, or the Portfolio page — is open.
--------------------------------------------------------------------------- */

export function WalletSheet() {
  const open = useElyraStore((state) => state.walletSheetOpen);
  const setOpen = useElyraStore((state) => state.setWalletSheetOpen);
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const signedIn = auth.ready && auth.authenticated;
  /* It opens from the store, not from a DialogTrigger, so Radix has nothing
     to hand focus back to. Whatever held focus when it opened gets it back. */
  const returnTo = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        ref={content}
        side="right"
        showClose={false}
        onOpenAutoFocus={(event) => {
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          /* Focus the drawer itself rather than its first control, the
             refresh button, whose tooltip would open the moment it did. */
          event.preventDefault();
          content.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnTo.current;
          returnTo.current = null;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        className="bottom-auto max-h-[calc(100dvh-24px)] w-[min(400px,calc(100vw-24px))] !rounded-sheet border-border-subtle p-0"
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle pl-5 pr-3">
          <Wallet size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
          <DialogTitle className="type-h2 min-w-0 flex-1 truncate font-sans">Wallet</DialogTitle>
          {/* Radix requires a description or an explicit opt-out; this is the
              accessible summary of what the drawer holds. */}
          <DialogDescription className="sr-only">
            Addresses, balances, assets and actions for your wallets on Solana, the EVM networks and Sui.
          </DialogDescription>
          {signedIn && (
            <IconButton
              label={wallet.refreshing ? "Refreshing balances" : "Refresh balances"}
              onClick={wallet.refetch}
              disabled={wallet.refreshing}
            >
              <RefreshCw size={16} strokeWidth={1.5} aria-hidden className={cn(wallet.refreshing && "animate-spin")} />
            </IconButton>
          )}
          <IconButton label="Close wallet" onClick={() => setOpen(false)}>
            <X size={17} strokeWidth={1.5} aria-hidden />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {!auth.ready ? (
            <div aria-busy="true" aria-label="Restoring your session" className="flex flex-col gap-3 p-5">
              <span aria-hidden className="skeleton h-8 w-48" />
              <span aria-hidden className="skeleton h-9 w-40" />
              <span aria-hidden className="skeleton h-11 w-full rounded-control" />
            </div>
          ) : !signedIn ? (
            <div className="flex flex-col items-start gap-3 p-5">
              <p className="type-body-sm text-text-secondary">Sign in to see your wallet, its balance and what it holds.</p>
              {auth.available && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    auth.login();
                  }}
                  className="type-body inline-flex h-10 items-center rounded-control bg-accent px-4 font-medium text-text-on-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover"
                >
                  Sign in
                </button>
              )}
            </div>
          ) : (
            <>
              <WalletIdentity wallet={wallet} />
              {wallet.address !== null && (
                <>
                  <WalletTotal wallet={wallet} />
                  {auth.available && <FundWallet address={wallet.address} cluster={wallet.cluster} />}
                  <WalletAssets wallet={wallet} />
                </>
              )}
              <EvmWallets cluster={wallet.cluster} />
              <SuiWallet cluster={wallet.cluster} />
              <WalletActions wallet={wallet} onSignedOut={() => setOpen(false)} />
              {wallet.address !== null && <WalletSync wallet={wallet} />}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
