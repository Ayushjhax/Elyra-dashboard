"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Coins,
  Gift,
  LayoutDashboard,
  PanelLeft,
  PieChart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/assets", label: "Assets", icon: Coins },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/personalized", label: "Personalized", icon: Sparkles },
  { href: "/referrals", label: "Referrals", icon: Gift },
];

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Identity, from the Privy session.
 *
 * Read-only: the address is shown and used to read Hyperliquid, never to
 * sign anything. When Privy is not configured the rail simply says so — the
 * dashboard runs on mock data and does not need a session.
 */
function Identity() {
  const auth = useElyraAuth();

  if (!auth.available) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-card border border-border-subtle",
          "bg-surface-raised px-2.5 py-2 mid:items-start",
        )}
      >
        <span className="type-label text-text-muted">No auth configured</span>
      </div>
    );
  }

  if (!auth.ready) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-card border border-border-subtle",
          "bg-surface-raised px-2.5 py-2 mid:items-start",
        )}
      >
        <span className="type-label text-text-muted">…</span>
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <button
        type="button"
        onClick={auth.login}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-card border border-border-strong",
          "bg-surface-raised px-2.5 py-2 mid:items-start",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <span className="type-label text-text-primary">Sign in</span>
      </button>
    );
  }

  /* Solana first: it is this app's chain, and on most accounts the EVM
     address is an embedded wallet the user never chose and would not
     recognise. The EVM one is still there for Hyperliquid. */
  const address = auth.solanaAddress ?? auth.walletAddress;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void auth.logout()}
          aria-label={address === null ? "Sign out" : `Wallet ${address}`}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-card border border-border-subtle",
            "bg-surface-raised px-2.5 py-2 mid:items-start",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
          )}
        >
          <span className="type-mono-addr text-text-secondary">
            {address === null ? "Signed in" : truncateAddress(address)}
          </span>
          <span className="type-label hidden text-text-muted mid:inline">
            Sign out
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <span className="type-mono-addr block break-all">
          {address ?? "No wallet on this account"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The six routes. `showLabels` forces labels on in the sheet, where there is
 * room for them regardless of the viewport.
 */
export function NavList({
  showLabels = false,
  onNavigate,
}: {
  showLabels?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="list-none space-y-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-[var(--control-h)] items-center gap-2.5 rounded-control pl-3 pr-2",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              active
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              !showLabels && "justify-center mid:justify-start",
            )}
          >
            {/* 2px accent bar marks the active route. */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-pill bg-accent",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon size={18} strokeWidth={1.5} className="shrink-0" />
            {/* sr-only rather than hidden: below 900px the label is not drawn,
                but it must still name the link for assistive tech. */}
            <span
              className={cn(
                "type-label truncate",
                showLabels ? "inline" : "sr-only mid:not-sr-only",
              )}
            >
              {label}
            </span>
          </Link>
        );

        return (
          <li key={href}>
            {showLabels ? (
              link
            ) : (
              /* The label is hidden below 900px, so name the icon there. */
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="mid:hidden">
                  {label}
                </TooltipContent>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NavRail() {
  const setLeftSheetOpen = useElyraStore((state) => state.setLeftSheetOpen);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "hidden min-h-0 flex-col overflow-hidden compact:flex",
        "rounded-panel border border-border-subtle bg-surface-panel",
      )}
    >
      <div className="flex shrink-0 items-center justify-center p-4 mid:justify-start">
        <Link
          href="/"
          aria-label="Elyra home"
          className="inline-flex items-center rounded-control"
        >
          <Image
            src="/logo.png"
            alt="Elyra"
            width={28}
            height={28}
            priority
            className="h-7 w-7 object-contain"
          />
        </Link>
      </div>

      {/* Below 900px column 2 lives in a sheet, so it needs a way in. */}
      <div className="shrink-0 px-2 pb-1 mid:hidden">
        <button
          type="button"
          onClick={() => setLeftSheetOpen(true)}
          aria-haspopup="dialog"
          title="Activity, watchlist and automation"
          className={cn(
            "flex h-[var(--control-h)] w-full items-center justify-center rounded-control",
            "border border-border-subtle text-text-secondary",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <PanelLeft size={18} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Open activity, watchlist and automation</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <NavList />
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2">
        <Identity />
      </div>
    </nav>
  );
}
