"use client";

import { RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { WalletActions } from "@/components/wallet/WalletActions";
import { WalletBalances } from "@/components/wallet/WalletBalances";
import { WalletIdentity } from "@/components/wallet/WalletIdentity";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { useElyraStore } from "@/lib/store";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The wallet panel, opened from the balance chip.

   A right-side sheet rather than a popover: it holds an address, a token
   list of unbounded length and four actions, which is more than a popover
   should carry and more than one would fit on a phone.

   It reads the same `useWalletDashboard` store the chip does, so opening it
   costs no extra request — the subscription is reference counted and the
   poll is already running.
--------------------------------------------------------------------------- */

export function WalletSheet() {
  const open = useElyraStore((state) => state.walletSheetOpen);
  const setOpen = useElyraStore((state) => state.setWalletSheetOpen);
  const wallet = useWalletDashboard();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent side="right" surface="panel" className="p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <DialogTitle asChild>
            <Eyebrow>Wallet</Eyebrow>
          </DialogTitle>
          {/* Radix requires a description or an explicit opt-out; this is the
              accessible summary of what the sheet contains. */}
          <DialogDescription className="sr-only">
            Address, balances and actions for the connected Solana wallet.
          </DialogDescription>

          <button
            type="button"
            onClick={wallet.refetch}
            aria-label="Refresh balances"
            className={cn(
              "ml-auto mr-6 rounded-control p-1 text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
            )}
          >
            <RefreshCw
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn(wallet.isLoading && "animate-spin")}
            />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <WalletIdentity wallet={wallet} />
          <WalletBalances wallet={wallet} />
          <WalletActions wallet={wallet} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
