"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, PieChart, Power, QrCode, Wallet } from "lucide-react";
import { Money, useBalancesHidden } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton, IconButton, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { Popover } from "@/components/ui/Popover";
import { NetworkMark } from "@/components/wallet/NetworkMark";
import { isEvmAddress } from "@/lib/evm/chains";
import { formatAge, truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { walletStatus } from "@/lib/wallet/status";
import { useWalletDashboard, type WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The connected wallet, and everything you do to it from the header.

   One control where there used to be three — a balance chip, a power button
   and the identity block in the rail. The rule the balance chip had still
   binds: this control never displays a number it does not have. A loading
   balance is a skeleton, never "$0.00", because $0.00 is a claim and the most
   alarming wrong one there is to make about somebody's wallet.

   The balance and the trigger are the SOLANA wallet's. The account's EVM
   wallet — one address on Ethereum and Robinhood Chain, also read for
   Hyperliquid — is a different wallet, so it gets its own labelled row below
   and never stands in for the Solana one. Its balances are in the wallet
   drawer, per network.

   Disconnecting stays behind a confirmation, because it is one click from
   everything else here and signing back in goes through email or OAuth.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

const TRIGGER = cn(
  "inline-flex h-10 items-center gap-2 rounded-card border border-border-subtle px-3",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
);

const DIVIDER = "border-[color-mix(in_srgb,var(--accent)_12%,transparent)]";

export function AccountMenu() {
  return <AccountMenuView auth={useElyraAuth()} wallet={useWalletDashboard()} />;
}

/** The menu with its data passed in, so every state renders from fixtures too. */
export function AccountMenuView({
  auth,
  wallet,
}: {
  auth: Pick<ElyraAuth, "available" | "ready" | "authenticated" | "solanaAddress" | "walletAddress" | "login" | "logout">;
  wallet: WalletDashboard;
}) {
  const router = useRouter();
  const setWalletSheetOpen = useElyraStore((state) => state.setWalletSheetOpen);
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const hidden = useBalancesHidden();
  const logos = useTickerLogos(SOL);
  const now = useSecond();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

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

  const address = auth.solanaAddress;
  const evmAddress = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  const state = walletStatus(wallet);
  const network = CLUSTER_LABEL[wallet.cluster ?? EXPECTED_CLUSTER];
  const snapshot = wallet.snapshot;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setConfirming(false);
      setDisconnectError(null);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setDisconnectError(null);
    try {
      await auth.logout();
      close(false);
      router.push("/");
    } catch (error: unknown) {
      setDisconnectError(error instanceof Error ? error.message : "Signing out failed. Try again.");
    } finally {
      /* Cleared even on failure, so a network error leaves a usable button
         rather than one stuck saying "Disconnecting". */
      setBusy(false);
    }
  };

  const row =
    "glass-row type-body-sm flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-text-primary";

  return (
    <>
      <Popover
        id="account-menu"
        label="Wallet"
        open={open}
        onOpenChange={close}
        surface="glass"
        pinOnPhone
        className="w-[min(360px,calc(100vw-24px))] p-4"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            aria-controls="account-menu"
            aria-haspopup="dialog"
            aria-label={address === null ? "Account" : `Solana wallet ${address}, ${state.label}`}
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
                state.tone === "positive" ? "bg-sage" : state.tone === "muted" ? "bg-text-muted" : state.tone === "caution" ? "bg-caution" : "bg-negative",
              )}
            />
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden className={cn("hidden text-text-muted compact:block", open && "rotate-180")} />
          </button>
        }
      >
        {confirming ? (
          <div className="flex flex-col gap-3">
            <p className="type-h2 font-sans text-text-primary">Disconnect this wallet?</p>
            <p className="type-body-sm text-text-secondary">
              You&rsquo;ll be signed out of Elyra and returned to the workspace. Nothing is deleted; signing back in
              goes through your original login method.
            </p>
            {disconnectError !== null && (
              <p role="alert" className="type-label text-negative">
                {disconnectError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setDisconnectError(null);
                }}
                disabled={busy}
                className="glass-outline type-body-sm h-9 rounded-[10px] border px-3.5 text-text-primary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => void disconnect()}
                aria-disabled={busy || undefined}
                className="type-body-sm h-9 rounded-[10px] border border-negative/40 bg-negative-bg px-3.5 font-medium text-negative hover:border-negative/70 aria-disabled:opacity-60"
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <CoinMark symbol="SOL" {...logos("SOL")} size={28} className="border-0 bg-transparent" />
              <h2 className="type-h2 min-w-0 flex-1 truncate font-sans text-text-primary">Solana wallet</h2>
              <StatusDot tone={state.tone}>{state.label}</StatusDot>
            </div>

            {address === null ? (
              <p className="type-body-sm mt-4 text-text-secondary">
                This account has no Solana wallet yet, so there is no balance or address to show.
              </p>
            ) : (
              <>
                <p className="type-body-sm mt-4 text-text-secondary">Wallet balance</p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {snapshot === null ? (
                      wallet.isLoading ? (
                        <span aria-label="Balance loading" className="skeleton block h-9 w-36 rounded-control" />
                      ) : (
                        <span className="type-display font-sans text-text-muted" title={wallet.error ?? undefined}>
                          —
                        </span>
                      )
                    ) : (
                      <Money
                        value={snapshot.usdValue}
                        reason="The SOL price is unavailable, so the total can't be valued."
                        className={cn("type-display block truncate font-sans", wallet.stale ? "text-text-secondary" : "text-text-primary")}
                      />
                    )}
                  </div>
                  <IconButton
                    label={hidden ? "Show balances" : "Hide balances"}
                    aria-pressed={hidden}
                    onClick={() => setHidden(!hidden)}
                    className={cn("size-9", hidden && "text-accent")}
                  >
                    {hidden ? <EyeOff size={18} strokeWidth={1.5} aria-hidden /> : <Eye size={18} strokeWidth={1.5} aria-hidden />}
                  </IconButton>
                </div>
                {(wallet.stale || (snapshot === null && !wallet.isLoading) || snapshot?.usdValue === null) && (
                  <p className={cn("type-label mt-1", wallet.stale || snapshot === null ? "text-caution" : "text-text-muted")}>
                    {wallet.stale
                      ? `Last good reading${wallet.fetchedAt !== null && now !== null ? `, ${formatAge(wallet.fetchedAt, now)}` : ""}.`
                      : snapshot === null
                        ? (wallet.error ?? "The balance couldn't be read.")
                        : "No SOL price right now, so the total can't be valued."}
                  </p>
                )}

                <div className="glass-inset mt-4 flex items-center gap-2 rounded-[10px] border py-2 pl-3.5 pr-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="type-mono-addr truncate text-text-primary" title={address}>
                      {truncateMiddle(address, 6, 6)}
                      <span className="sr-only"> (full address: {address})</span>
                    </p>
                    <p className="type-label text-text-secondary">{network}</p>
                  </div>
                  <CopyButton value={address} label="wallet address" className="size-9" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-autofocus
                    onClick={() => {
                      close(false);
                      setReceiving(true);
                    }}
                    className="type-body-sm inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent font-medium text-text-on-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover"
                  >
                    <QrCode size={17} strokeWidth={1.5} aria-hidden />
                    Receive
                  </button>
                  <a
                    href={accountExplorerUrl(address, wallet.cluster)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => close(false)}
                    className="glass-outline type-body-sm inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-2 text-text-primary"
                  >
                    <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
                    View on explorer
                  </a>
                </div>
              </>
            )}

            {evmAddress !== null && (
              <section aria-label="EVM wallet" className={cn("mt-4 border-t pt-3", DIVIDER)}>
                <p className="type-body-sm text-text-secondary">EVM wallet</p>
                <div className="glass-inset mt-1.5 flex items-center gap-2.5 rounded-[10px] border py-2 pl-3 pr-1.5">
                  {/* Both marks, overlapped: one address, two networks. */}
                  <span aria-hidden className="flex shrink-0 -space-x-1">
                    <NetworkMark network="ethereum" size={20} />
                    <NetworkMark network="robinhood" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="type-mono-addr truncate text-text-primary" title={evmAddress}>
                      {truncateMiddle(evmAddress, 6, 4)}
                      <span className="sr-only"> (full address: {evmAddress})</span>
                    </p>
                    <p className="type-label truncate text-text-secondary">Ethereum · Robinhood Chain</p>
                  </div>
                  <CopyButton value={evmAddress} label="EVM wallet address" className="size-9" />
                </div>
              </section>
            )}

            <nav aria-label="Wallet" className={cn("mt-4 flex flex-col gap-0.5 border-t pt-3", DIVIDER)}>
              <button
                type="button"
                onClick={() => {
                  close(false);
                  setWalletSheetOpen(true);
                }}
                className={row}
              >
                <Wallet size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                <span className="flex-1">Open wallet</span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
              </button>
              <Link href="/portfolio" onClick={() => close(false)} className={row}>
                <PieChart size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                <span className="flex-1">Portfolio</span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
              </Link>
            </nav>

            <div className={cn("mt-3 border-t pt-3", DIVIDER)}>
              <button type="button" onClick={() => setConfirming(true)} className={cn(row, "text-negative")}>
                <Power size={18} strokeWidth={1.5} aria-hidden />
                <span className="flex-1">Disconnect</span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-negative/70" />
              </button>
            </div>
          </>
        )}
      </Popover>

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={address} cluster={wallet.cluster} />
    </>
  );
}
