"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogIn, LogOut, UserRound, Wallet } from "lucide-react";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { Identicon } from "@/components/ui/Identicon";
import { Popover } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signInLabel } from "@/lib/account";
import { truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { useElyraStore } from "@/lib/store";
import { walletIdentity, walletStatus } from "@/lib/wallet/status";
import { useWalletDashboard, type WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The account, from the foot of the rail.

   The avatar is the wallet's identicon (lib/identicon.ts), drawn from the
   same address and network the menu and the wallet drawer show, all of them
   read from the one `useWalletDashboard` store — so the face, the address,
   the network and "Wallet connected" can never describe different wallets.

   Signing out of the account lives here. The wallet drawer's Disconnect ends
   the same session — it is the app's only kind of disconnect — but this is
   where the account itself is left, by name.

   Below 640px there is no rail; the navigation sheet carries the same panel
   inline (`SheetAccount`).
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

/* The rail's own item geometry, so the avatar sits on the routes' grid. */
const ITEM = cn(
  "relative flex h-11 w-full min-w-0 items-center gap-3 rounded-card px-1",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

const ROW = cn(
  "flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-left",
  "type-body-sm text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:bg-surface-hover focus-visible:bg-surface-hover aria-disabled:opacity-70",
);

const DOT = { positive: "bg-sage", caution: "bg-caution", negative: "bg-negative", muted: "bg-text-muted" } as const;

function AccountPanel({
  auth,
  wallet,
  onClose,
  onOpenWallet,
}: {
  auth: ElyraAuth;
  wallet: WalletDashboard;
  /** Close whatever holds the panel. */
  onClose: () => void;
  onOpenWallet: () => void;
}) {
  const router = useRouter();
  const logos = useTickerLogos(SOL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identity = walletIdentity(wallet);
  const status = walletStatus(wallet);
  const method = signInLabel(auth.account?.loginMethod ?? null);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
      onClose();
      router.push("/");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Signing out failed. Try again.");
    } finally {
      /* Cleared on failure too, so an error leaves a usable row rather than
         one stuck saying "Signing out". */
      setBusy(false);
    }
  };

  return (
    <>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Identicon identity={identity?.mark ?? null} size={40} />
          <div className="min-w-0">
            <p className="type-h2 truncate font-sans text-text-primary">Your account</p>
            {method !== null && <p className="type-body-sm truncate text-text-secondary">{method}</p>}
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <CoinMark symbol="SOL" {...logos("SOL")} size={18} className="border-0 bg-transparent" />
          <span className="type-body-sm min-w-0 flex-1 truncate text-text-primary">
            {identity?.networkLabel ?? wallet.chain}
          </span>
          <span className="type-label inline-flex shrink-0 items-center gap-1.5 text-text-secondary">
            <span aria-hidden className={cn("size-1.5 rounded-pill", DOT[status.tone])} />
            {status.tone === "positive" ? "Wallet connected" : status.label}
          </span>
        </div>

        {identity === null ? (
          <p className="type-body-sm mt-3 text-text-secondary">
            {wallet.isLoading ? "Reading your wallet…" : "This account has no Solana wallet yet."}
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-control border border-border-subtle py-0.5 pl-3 pr-0.5">
            <span className="type-mono-addr min-w-0 flex-1 truncate text-text-primary" title={identity.address}>
              {truncateMiddle(identity.address, 4, 4)}
              <span className="sr-only"> (full address: {identity.address})</span>
            </span>
            <CopyButton value={identity.address} label="wallet address" />
          </div>
        )}
      </div>

      <div className="mx-4 border-t border-border-subtle" />
      <div className="flex flex-col gap-0.5 p-2">
        {/* First focus lands on the first action, not on the copy button,
            whose tooltip would open over the status line. */}
        <Link href="/dashboard#account" onClick={onClose} data-autofocus className={ROW}>
          <UserRound size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
          <span className="flex-1">Account settings</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        </Link>
        <button type="button" onClick={onOpenWallet} className={ROW}>
          <Wallet size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
          <span className="flex-1">Open wallet</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        </button>
      </div>

      <div className="mx-4 border-t border-border-subtle" />
      <div className="p-2">
        <button
          type="button"
          onClick={() => void signOut()}
          aria-disabled={busy || undefined}
          className={cn(ROW, "text-negative")}
        >
          <LogOut size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="flex-1">{busy ? "Signing out…" : "Sign out"}</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-negative/70" />
        </button>
        {error !== null && (
          <p role="alert" className="type-label px-3 pb-1 text-negative">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** The avatar at the foot of the rail, and the account menu it opens. */
export function RailAccount({ icons }: { icons: boolean }) {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const setWalletSheetOpen = useElyraStore((state) => state.setWalletSheetOpen);
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!auth.available) return null;

  if (!(auth.ready && auth.authenticated)) {
    const label = auth.ready ? "Sign in" : "Restoring session";
    return (
      <Tooltip open={tip && icons} onOpenChange={setTip}>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={!auth.ready}
            aria-label={label}
            onClick={auth.login}
            className={cn(ITEM, "text-text-secondary hover:bg-surface-hover hover:text-text-primary")}
          >
            {auth.ready ? (
              <span
                aria-hidden
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill border border-border-strong bg-surface-raised"
              >
                <LogIn size={16} strokeWidth={1.5} />
              </span>
            ) : (
              <Identicon identity={null} size={36} />
            )}
            <span className="rail-label type-label">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  const identity = walletIdentity(wallet);

  return (
    <Popover
      id="rail-account-menu"
      label="Account"
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="end"
      className="ml-4 max-h-[calc(100dvh-24px)] w-[min(312px,calc(100vw-24px))] overflow-y-auto !rounded-sheet border-border-subtle p-0"
      trigger={
        /* Always the same element under the tooltip, so opening the menu
           never remounts the button that has focus. */
        <Tooltip open={tip && icons && !open} onOpenChange={setTip}>
          <TooltipTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label="Open account menu"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="rail-account-menu"
              onClick={() => setOpen(!open)}
              className={cn(
                ITEM,
                open ? "bg-surface-hover text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <Identicon identity={identity?.mark ?? null} size={36} active={open} />
              <span className="rail-label type-label">
                {identity === null ? "Your account" : truncateMiddle(identity.address, 4, 4)}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Account</TooltipContent>
        </Tooltip>
      }
    >
      <AccountPanel
        auth={auth}
        wallet={wallet}
        onClose={() => setOpen(false)}
        onOpenWallet={() => {
          /* Focus goes back to the avatar first, so the drawer — which
             returns focus to whatever had it when it opened — hands it back
             here when it closes. */
          setOpen(false);
          triggerRef.current?.focus();
          setWalletSheetOpen(true);
        }}
      />
    </Popover>
  );
}

/** The same account panel, inline in the navigation sheet on a phone. */
export function SheetAccount({ onNavigate }: { onNavigate: () => void }) {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const setWalletSheetOpen = useElyraStore((state) => state.setWalletSheetOpen);

  if (!auth.available) return null;

  if (!auth.ready) {
    return <span aria-hidden className="skeleton block h-14 w-full rounded-panel" />;
  }

  if (!auth.authenticated) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          auth.login();
        }}
        className={cn(ROW, "border border-border-subtle")}
      >
        <LogIn size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
        <span className="flex-1">Sign in</span>
      </button>
    );
  }

  return (
    <section aria-label="Account" className="rounded-panel border border-border-subtle bg-surface-raised">
      <AccountPanel
        auth={auth}
        wallet={wallet}
        onClose={onNavigate}
        onOpenWallet={() => {
          onNavigate();
          setWalletSheetOpen(true);
        }}
      />
    </section>
  );
}
