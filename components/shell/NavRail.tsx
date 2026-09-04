"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Blocks,
  Bot,
  LogIn,
  Coins,
  Gift,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  PieChart,
  Sparkles,
  Wallet,
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

/**
 * The six routes, in the order the operator asked for them.
 *
 * Home is first and stands apart from the rest — see `NavRail` — so the five
 * below it are the ones that share the scrolling list.
 */
export const HOME_ITEM: NavItem = {
  href: "/",
  label: "Home",
  icon: LayoutDashboard,
};

const NAV_ITEMS: NavItem[] = [
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/personalized", label: "Personalized", icon: Sparkles },
  { href: "/assets", label: "Assets", icon: Coins },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/referrals", label: "Referrals", icon: Gift },
];

/** Home included, for the sheet, where there is no palette to sit between. */
export const ALL_NAV_ITEMS: NavItem[] = [HOME_ITEM, ...NAV_ITEMS];

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
          "group-data-[icons=true]/rail:items-center",
        )}
      >
        <span className="type-label text-text-muted group-data-[icons=true]/rail:hidden">
          No auth configured
        </span>
        <Wallet
          size={16}
          strokeWidth={1.5}
          aria-label="No auth configured"
          className="hidden text-text-muted group-data-[icons=true]/rail:block"
        />
      </div>
    );
  }

  if (!auth.ready) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-card border border-border-subtle",
          "bg-surface-raised px-2.5 py-2 mid:items-start",
          "group-data-[icons=true]/rail:items-center",
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
          "flex w-full min-w-0 flex-col items-center gap-1 rounded-card border border-border-strong",
          "bg-surface-raised px-2.5 py-2 mid:items-start",
          "group-data-[icons=true]/rail:items-center",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <span className="type-label text-text-primary group-data-[icons=true]/rail:hidden">
          Sign in
        </span>
        <LogIn
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="hidden text-text-primary group-data-[icons=true]/rail:block"
        />
        <span className="sr-only hidden group-data-[icons=true]/rail:inline">Sign in</span>
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
            "flex w-full min-w-0 flex-col items-center gap-1 rounded-card border border-border-subtle",
            "bg-surface-raised px-2.5 py-2 mid:items-start",
            "group-data-[icons=true]/rail:items-center",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
          )}
        >
          <span className="type-mono-addr max-w-full truncate text-text-secondary group-data-[icons=true]/rail:hidden">
            {address === null ? "Signed in" : truncateAddress(address)}
          </span>
          <Wallet
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className="hidden text-text-secondary group-data-[icons=true]/rail:block"
          />
          <span className="type-label hidden text-text-muted mid:inline group-data-[icons=true]/rail:hidden">
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
 * A run of routes. `showLabels` forces labels on in the sheet, where there is
 * room for them regardless of the viewport.
 *
 * `items` defaults to the five that sit below the palette; the rail draws Home
 * as a list of its own above it, and the sheet passes all six.
 */
export function NavList({
  items = NAV_ITEMS,
  showLabels = false,
  onNavigate,
}: {
  items?: NavItem[];
  showLabels?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="list-none space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative isolate flex h-[var(--control-h)] items-center gap-2.5 overflow-hidden rounded-control pl-3 pr-2",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              active
                ? "fill-active bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              !showLabels &&
                "justify-center mid:justify-start group-data-[icons=true]/rail:justify-center",
            )}
          >
            {/* The active route is the one lit item in the rail: 1.7's forest
                gradient for the fill, and the bar it already had with 1.6's
                bloom spilling off it. */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-pill",
                "fill-accent bg-accent",
                "transition-opacity duration-[var(--dur-fast)] ease-brand",
                active ? "opacity-100 shadow-lift-accent" : "opacity-0",
              )}
            />
            <Icon size={18} strokeWidth={1.5} className="shrink-0" />
            {/* sr-only rather than hidden: below 900px the label is not drawn,
                but it must still name the link for assistive tech. */}
            <span
              className={cn(
                "type-label truncate",
                showLabels
                  ? "inline"
                  : "sr-only mid:not-sr-only group-data-[icons=true]/rail:sr-only",
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

/**
 * The way into the components palette.
 *
 * It sits under Home and above the rest of the routes, apart from all of them,
 * because it is a tool rather than a destination: pressing it changes what this
 * screen is made of, not which screen you are on. Home stays above it as the
 * one route that is always the way back. Only from 900px up, where the column
 * it composes exists — below that the same panels live in a sheet and there is
 * nothing to arrange.
 *
 * Same shape as a route, and quieter. It used to take a full lime fill when
 * open, which made a tool the loudest thing in the rail — louder than the page
 * you were actually on. On means the icon turns accent and the same 2px bar a
 * route uses lights up, so the rail has exactly one filled item and it is
 * always the current route.
 */
function PaletteToggle() {
  const open = useElyraStore((state) => state.paletteOpen);
  const setPaletteOpen = useElyraStore((state) => state.setPaletteOpen);

  const button = (
    <button
      type="button"
      aria-pressed={open}
      aria-label={open ? "Close components" : "Open components"}
      onClick={() => setPaletteOpen(!open)}
      className={cn(
        "relative flex h-[var(--control-h)] w-full items-center gap-2.5 rounded-control pl-3 pr-2",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        "justify-center mid:justify-start group-data-[icons=true]/rail:justify-center",
        open
          ? "text-accent"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      {/* The same marker a route uses, so "on" reads the same way twice. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-pill",
          "fill-accent bg-accent transition-opacity duration-[var(--dur-fast)] ease-brand",
          open ? "opacity-100 shadow-lift-accent" : "opacity-0",
        )}
      />
      <Blocks size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
      <span className="type-label hidden truncate mid:inline group-data-[icons=true]/rail:hidden">
        Components
      </span>
    </button>
  );

  return (
    <div className="hidden shrink-0 px-2 pb-1 mid:block">
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">
          Add, move or remove the panels in column two
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * The switches for the two columns that can be closed outright.
 *
 * They belong here rather than on the columns themselves for the obvious
 * reason: a closed column has nowhere to put its own way back. Icon buttons
 * whatever the rail's width, because the rail is the one thing that has to
 * survive being dragged down to 56px.
 */
function ColumnToggles() {
  const stackOpen = useElyraStore((state) => state.stackOpen);
  const setStackOpen = useElyraStore((state) => state.setStackOpen);
  const assistOpen = useElyraStore((state) => state.assistOpen);
  const setAssistOpen = useElyraStore((state) => state.setAssistOpen);

  const toggles: Array<{
    open: boolean;
    set: (open: boolean) => void;
    icon: LucideIcon;
    label: string;
    hint: string;
    className?: string;
  }> = [
    {
      open: stackOpen,
      set: setStackOpen,
      icon: PanelLeft,
      label: "panel column",
      hint: "The composed column beside the chart",
    },
    {
      open: assistOpen,
      set: setAssistOpen,
      icon: PanelRight,
      label: "assistant column",
      hint: "Chat and signals, on the right",
      /* Below 1280 the assistant is a drawer, and a drawer has its own way in
         from the market header. Nothing to switch. */
      className: "hidden full:inline-flex",
    },
  ];

  return (
    <div className="hidden shrink-0 gap-1 border-t border-border-subtle p-2 mid:flex">
      {toggles.map(({ open, set, icon: Icon, label, hint, className }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={open}
              aria-label={open ? `Close the ${label}` : `Open the ${label}`}
              onClick={() => set(!open)}
              className={cn(
                "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-control",
                "border transition-colors duration-[var(--dur-fast)] ease-brand",
                open
                  ? "border-border-strong bg-surface-raised text-accent"
                  : "border-border-subtle text-text-muted hover:bg-surface-hover hover:text-text-primary",
                className,
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {open ? `Hide ${label} — ${hint}` : `Show ${label} — ${hint}`}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function NavRail({ icons = false }: { icons?: boolean }) {
  const setLeftSheetOpen = useElyraStore((state) => state.setLeftSheetOpen);

  return (
    <nav
      aria-label="Primary"
      /* Icons only once the rail is too narrow for its labels — which is where
         opening the palette puts it, and where dragging the rail's own handle
         in can put it too. AppShell decides, because only the fitter knows how
         wide the rail actually ended up. Every label below answers to this
         attribute rather than taking a prop of its own. */
      data-icons={icons ? "true" : undefined}
      className={cn(
        "group/rail relative isolate flex min-h-0 flex-1 flex-col overflow-hidden",
        "rim rounded-panel border border-border-subtle bg-surface-panel",
      )}
    >
      <div className="flex shrink-0 items-center justify-center p-4 mid:justify-start group-data-[icons=true]/rail:justify-center">
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

      {/* Home, then the palette, then the rest — the sequence the rail reads
          in. Home is the one route that is always the way back, so it sits
          above the tool rather than in the list under it. */}
      <div className="shrink-0 px-2 pb-1">
        <NavList items={[HOME_ITEM]} />
      </div>

      <PaletteToggle />

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

      <ColumnToggles />

      <div className="shrink-0 border-t border-border-subtle p-2">
        <Identity />
      </div>
    </nav>
  );
}
