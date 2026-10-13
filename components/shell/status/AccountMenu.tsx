"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, PieChart, Power, Wallet } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { formatUsd, truncateMiddle } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The connected wallet, and everything you do to it from the header.

   One control where there used to be three — a balance chip, a power button
   and the identity block in the rail. The rule the balance chip had still
   binds: this control never displays a number it does not have. A loading
   balance is a skeleton, never "$0.00", because $0.00 is a claim and the most
   alarming wrong one there is to make about somebody's wallet.

   Disconnecting stays behind a confirmation, because it is one click from
   everything else here and signing back in goes through email or OAuth.
--------------------------------------------------------------------------- */

const TRIGGER = cn(
  "inline-flex h-10 items-center gap-2 rounded-card border border-border-subtle px-3",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
);

export function AccountMenu() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const router = useRouter();
  const setWalletSheetOpen = useElyraStore((state) => state.setWalletSheetOpen);
  const balancesHidden = useElyraStore((state) => state.balancesHidden);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  /* No Privy at all: the terminal still runs, and a Connect button that opens
     nothing would be worse than no button. */
  if (!auth.available) return null;

  if (!auth.ready) {
    return <span aria-hidden className="skeleton h-10 w-[148px] rounded-card" />;
  }

  if (!auth.authenticated) {
    return (
      <Button variant="accent" onClick={auth.login} className="h-10 rounded-card px-4">
        <Wallet size={16} strokeWidth={1.5} aria-hidden />
        Connect
      </Button>
    );
  }

  /* Solana first: it is this app's chain, and on most accounts the EVM
     address is an embedded wallet the user never chose. */
  const address = auth.solanaAddress ?? auth.walletAddress;
  const usd = wallet.usdValue;
  const degraded = wallet.stale || wallet.error !== null || wallet.unconfigured;
  const reason = wallet.unconfigured
    ? "The Solana RPC is not configured, so no balance can be read."
    : wallet.error !== null
      ? wallet.stale
        ? `Showing the last reading. ${wallet.error}`
        : wallet.error
      : usd === null && !wallet.isLoading
        ? "The SOL price is unavailable, so the total cannot be computed."
        : null;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setConfirming(false);
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await auth.logout();
      close(false);
      router.push("/");
    } finally {
      /* Cleared even on failure, so a network error leaves a usable button
         rather than one stuck saying "Disconnecting". */
      setBusy(false);
    }
  };

  const copy = async () => {
    if (address === null) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard refused (insecure origin, permissions). The address is on
         screen in full for a manual copy, so there is nothing to report. */
    }
  };

  return (
    <Popover
      id="account-menu"
      label="Account"
      open={open}
      onOpenChange={close}
      className="w-72 p-1.5"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="account-menu"
          aria-haspopup="dialog"
          aria-label={address === null ? "Account" : `Account ${address}`}
          onClick={() => close(!open)}
          className={cn(TRIGGER, open && "bg-surface-hover")}
        >
          <Wallet size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
          <span className="type-mono-addr hidden text-text-primary compact:inline">
            {address === null ? "Signed in" : truncateMiddle(address, 4, 4)}
          </span>
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-pill",
              degraded ? "bg-negative" : wallet.isLoading ? "bg-text-muted" : "bg-positive",
            )}
          />
        </button>
      }
    >
      {confirming ? (
        <div className="p-2.5">
          <p className="type-body-sm text-text-primary">Disconnect this wallet?</p>
          <p className="type-label mt-1 text-text-muted">
            You will be signed out and returned to the workspace. Signing back in
            goes through your original login method.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-autofocus
              onClick={() => void disconnect()}
              disabled={busy}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-2.5 pb-2.5 pt-2">
            <p className="type-eyebrow text-text-muted">Wallet balance</p>
            <div className="mt-1 flex items-center gap-2">
              {degraded && (
                <AlertTriangle size={14} strokeWidth={1.5} aria-hidden className="text-negative" />
              )}
              {usd === null ? (
                <span aria-label="Balance loading" className="skeleton h-6 w-24" />
              ) : (
                <span
                  className={cn(
                    "type-h1 tabular-nums",
                    wallet.stale ? "text-text-secondary" : "text-text-primary",
                  )}
                >
                  {balancesHidden ? "••••••" : formatUsd(usd)}
                </span>
              )}
            </div>
            {reason !== null && <p className="type-label mt-1 text-text-muted">{reason}</p>}

            {address !== null && (
              <div className="mt-3 flex items-center gap-2 rounded-control border border-border-subtle bg-surface-raised px-2.5 py-2">
                <span className="type-mono-addr min-w-0 flex-1 break-all text-text-secondary">
                  {address}
                </span>
                <button
                  type="button"
                  onClick={() => void copy()}
                  aria-label={copied ? "Address copied" : "Copy address"}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-text-muted hover:bg-surface-hover hover:text-text-primary"
                >
                  {copied ? (
                    <Check size={14} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Copy size={14} strokeWidth={1.5} aria-hidden />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border-subtle pt-1.5">
            <MenuRow
              icon={<Wallet size={16} strokeWidth={1.5} aria-hidden />}
              onClick={() => {
                close(false);
                setWalletSheetOpen(true);
              }}
            >
              Open wallet
            </MenuRow>
            <Link
              href="/portfolio"
              onClick={() => close(false)}
              className={ROW}
            >
              <PieChart size={16} strokeWidth={1.5} aria-hidden />
              Portfolio
            </Link>
            <MenuRow
              icon={<Power size={16} strokeWidth={1.5} aria-hidden />}
              className="text-negative hover:bg-negative-bg hover:text-negative"
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </MenuRow>
          </div>
        </>
      )}
    </Popover>
  );
}

const ROW = cn(
  "flex h-9 w-full items-center gap-2 rounded-control px-2.5 text-left",
  "type-label text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:bg-surface-hover hover:text-text-primary",
);

function MenuRow({
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { icon: React.ReactNode }) {
  return (
    <button type="button" className={cn(ROW, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
