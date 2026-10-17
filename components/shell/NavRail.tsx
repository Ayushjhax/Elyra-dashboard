"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  Coins,
  FileSearch,
  Gift,
  LayoutDashboard,
  Link2,
  PieChart,
  RotateCcw,
  Settings,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { RailAccount } from "@/components/shell/RailAccount";
import { Popover } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Every destination in the terminal, in the order the operator asked for
 * them. Home is the workspace itself; every other route opens beside the
 * chart or, for the full-bleed ones, in the workspace's place.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard", label: "Dashboard", icon: Wallet },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/personalized", label: "Personalized", icon: Sparkles },
  { href: "/assets", label: "Assets", icon: Coins },
  { href: "/agent", label: "Connections", icon: Link2 },
  { href: "/research", label: "Research", icon: FileSearch },
  { href: "/referrals", label: "Referrals", icon: Gift },
];

const ITEM = cn(
  "relative flex h-11 w-full min-w-0 items-center gap-3 rounded-card px-[13px]",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

/**
 * A run of routes. `showLabels` forces labels on in the sheet, where there is
 * room for them regardless of the rail's width.
 */
export function NavList({
  showLabels = false,
  icons = false,
  onNavigate,
}: {
  showLabels?: boolean;
  /** The rail is showing icons only, so each one needs a tooltip. */
  icons?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex list-none flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              ITEM,
              active
                ? "bg-surface-active text-accent"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
            {/* Collapses to zero width rather than being swapped out, so the
                rail glides between its two widths. It stays in the
                accessibility tree at zero width: the icon has no text. */}
            <span
              className={cn(
                "type-label",
                active ? "text-text-primary" : undefined,
                showLabels ? "inline" : "rail-label",
              )}
            >
              {label}
            </span>
          </Link>
        );

        return (
          <li key={href}>
            {/* A tooltip only while the labels are hidden — one repeating a
                visible label is noise. */}
            {icons && !showLabels ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Labels on and off. Only from 900px: below that the rail is always icons. */
function ExpandToggle({ icons }: { icons: boolean }) {
  const expanded = useElyraStore((state) => state.railExpanded);
  const setExpanded = useElyraStore((state) => state.setRailExpanded);
  const label = expanded ? "Collapse navigation" : "Expand navigation";

  const button = (
        <button
          type="button"
          aria-pressed={expanded}
          aria-label={label}
          onClick={() => setExpanded(!expanded)}
          className={cn(
            ITEM,
            "hidden text-text-muted hover:bg-surface-hover hover:text-text-primary mid:flex",
          )}
        >
          {expanded ? (
            <ChevronsLeft size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          ) : (
            <ChevronsRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          )}
          <span className="rail-label type-label">Collapse</span>
        </button>
  );

  return icons ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const resetLayout = useElyraStore((state) => state.resetLayout);
  const setCommandOpen = useElyraStore((state) => state.setCommandOpen);
  const balancesHidden = useElyraStore((state) => state.balancesHidden);
  const setBalancesHidden = useElyraStore((state) => state.setBalancesHidden);

  const row = cn(
    "flex h-9 w-full items-center gap-2 rounded-control px-2.5 text-left",
    "type-label text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
    "hover:bg-surface-hover hover:text-text-primary",
  );

  return (
    <Popover
      id="rail-settings"
      label="Workspace settings"
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="end"
      className="w-60 p-1.5"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="rail-settings"
          aria-haspopup="dialog"
          aria-label="Workspace settings"
          onClick={() => setOpen(!open)}
          className={cn(
            ITEM,
            open
              ? "bg-surface-hover text-text-primary"
              : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Settings size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="rail-label type-label">Settings</span>
        </button>
      }
    >
      <p className="type-eyebrow px-2.5 pb-1 pt-1.5 text-text-muted">Workspace</p>
      <button
        type="button"
        className={row}
        onClick={() => {
          setBalancesHidden(!balancesHidden);
          setOpen(false);
        }}
      >
        <Wallet size={16} strokeWidth={1.5} aria-hidden />
        {balancesHidden ? "Show balances" : "Hide balances"}
      </button>
      <button
        type="button"
        className={row}
        onClick={() => {
          setOpen(false);
          setCommandOpen(true);
        }}
      >
        <FileSearch size={16} strokeWidth={1.5} aria-hidden />
        <span className="flex-1">Search</span>
        <kbd className="type-data-sm rounded-chip border border-border-strong px-1.5 text-text-muted">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        className={row}
        onClick={() => {
          resetLayout();
          setOpen(false);
        }}
      >
        <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
        Reset layout
      </button>
    </Popover>
  );
}

export function NavRail({
  icons,
  className,
}: {
  /** Labels hidden — decided by the fitter in AppShell, see `railIcons`. */
  icons: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="Primary"
      data-icons={icons ? "true" : "false"}
      className={cn(
        "group/rail relative z-20 min-h-0 flex-col border-r border-border-subtle bg-surface-base",
        className,
      )}
    >
      <div className="flex h-[var(--header-h)] shrink-0 items-center px-[11px]">
        <Link
          href="/"
          aria-label="Elyra home"
          className="relative inline-flex size-[42px] shrink-0 items-center justify-center overflow-hidden rounded-pill border border-border-subtle"
        >
          <Image
            src="/logo.png"
            alt=""
            width={42}
            height={42}
            priority
            className="size-full scale-[1.14] object-cover"
          />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
        <NavList icons={icons} />
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border-subtle px-2.5 py-3">
        <ExpandToggle icons={icons} />
        <SettingsMenu />
        <RailAccount icons={icons} />
      </div>
    </nav>
  );
}
