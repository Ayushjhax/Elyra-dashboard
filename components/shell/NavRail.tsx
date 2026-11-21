"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  FileSearch,
  Gift,
  Globe2,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  type LucideIcon,
  Newspaper,
  PieChart,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Swords,
  Wallet,
  LayoutGrid,
  Bookmark,
  X,
  Plus,
} from "lucide-react";
import { RailAccount } from "@/components/shell/RailAccount";
import { Popover } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { BUILT_IN_LAYOUTS, MAX_LAYOUT_NAME, readSavedLayouts } from "@/lib/workspaceLayouts";

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
  { href: "/", label: msg("Home"), icon: LayoutDashboard },
  { href: "/dashboard", label: msg("Dashboard"), icon: Wallet },
  { href: "/portfolio", label: msg("Portfolio"), icon: PieChart },
  { href: "/markets", label: msg("World markets"), icon: Globe2 },
  { href: "/invest", label: msg("Invest"), icon: Layers },
  { href: "/automation", label: msg("Automation"), icon: Bot },
  { href: "/agents", label: msg("Agents"), icon: ShieldCheck },
  { href: "/funds", label: msg("Funds"), icon: Landmark },
  { href: "/arena", label: msg("Arena"), icon: Swords },
  { href: "/personalized", label: msg("Personalized"), icon: Sparkles },
  { href: "/assets", label: msg("Assets"), icon: Coins },
  { href: "/agent", label: msg("Connections"), icon: Link2 },
  { href: "/research", label: msg("Research"), icon: FileSearch },
  { href: "/briefing", label: msg("Daily briefing"), icon: Sunrise },
  { href: "/events", label: msg("Events"), icon: Newspaper },
  { href: "/referrals", label: msg("Referrals"), icon: Gift },
];

const ITEM = cn(
  "relative flex h-11 w-full min-w-0 items-center gap-3 rounded-card px-[13px] short:h-9",
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
  const t = useT();
  const pathname = usePathname();

  return (
    <ul className="flex list-none flex-col gap-1 short:gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        /* A route's own sub-pages (a portfolio under /invest) keep its link lit. */
        const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
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
              {t(label)}
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
                <TooltipContent side="right">{t(label)}</TooltipContent>
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
  const t = useT();
  const expanded = useElyraStore((state) => state.railExpanded);
  const setExpanded = useElyraStore((state) => state.setRailExpanded);
  const label = expanded ? t("Collapse navigation") : t("Expand navigation");

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
          <span className="rail-label type-label">{t("Collapse")}</span>
        </button>
  );

  return icons ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{t(label)}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}

function SettingsMenu() {
  const t = useT();
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
      label={t("Workspace settings")}
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="end"
      className="max-h-[min(640px,calc(100dvh-24px))] w-60 overflow-y-auto p-1.5"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="rail-settings"
          aria-haspopup="dialog"
          aria-label={t("Workspace settings")}
          onClick={() => setOpen(!open)}
          className={cn(
            ITEM,
            open
              ? "bg-surface-hover text-text-primary"
              : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Settings size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="rail-label type-label">{t("Settings")}</span>
        </button>
      }
    >
      <p className="type-eyebrow px-2.5 pb-1 pt-1.5 text-text-muted">{t("Workspace")}</p>
      <button
        type="button"
        className={row}
        onClick={() => {
          setBalancesHidden(!balancesHidden);
          setOpen(false);
        }}
      >
        <Wallet size={16} strokeWidth={1.5} aria-hidden />
        {balancesHidden ? t("Show balances") : t("Hide balances")}
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
        <span className="flex-1">{t("Search")}</span>
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
        {t("Reset layout")}
      </button>
      <Layouts row={row} onApplied={() => setOpen(false)} />
    </Popover>
  );
}

/**
 * Saved arrangements of the workspace: the built-ins, the operator's own,
 * and saving the one on screen. lib/workspaceLayouts.ts holds them to the
 * shell's bounds; applying one is a store write like any drag.
 */
function Layouts({ row, onApplied }: { row: string; onApplied: () => void }) {
  const t = useT();
  const saved = useElyraStore((state) => state.savedLayouts);
  const applyLayout = useElyraStore((state) => state.applyLayout);
  const saveLayout = useElyraStore((state) => state.saveLayout);
  const deleteLayout = useElyraStore((state) => state.deleteLayout);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const mine = readSavedLayouts(saved);

  return (
    <div className="mt-1 border-t border-border-subtle pt-1">
      <p className="type-eyebrow px-2.5 pb-1 pt-1.5 text-text-muted">{t("Layouts")}</p>
      {BUILT_IN_LAYOUTS.map((layout) => (
        <button
          key={layout.id}
          type="button"
          className={row}
          onClick={() => {
            applyLayout(layout);
            onApplied();
          }}
        >
          <LayoutGrid size={16} strokeWidth={1.5} aria-hidden />
          {t(layout.name)}
        </button>
      ))}
      {mine.map((layout) => (
        <div key={layout.id} className="flex items-center">
          <button
            type="button"
            className={cn(row, "min-w-0 flex-1")}
            onClick={() => {
              applyLayout(layout);
              onApplied();
            }}
          >
            <Bookmark size={16} strokeWidth={1.5} aria-hidden />
            <span className="truncate">{layout.name}</span>
          </button>
          <button
            type="button"
            aria-label={t("Delete the layout {name}", { name: layout.name })}
            onClick={() => deleteLayout(layout.id)}
            className="grid size-8 shrink-0 place-items-center rounded-control text-text-muted hover:bg-surface-hover hover:text-negative"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ))}
      {naming ? (
        <form
          className="flex flex-col gap-1.5 px-1.5 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            const failure = saveLayout(name);
            if (failure !== null) {
              setProblem(t(failure));
              return;
            }
            setName("");
            setNaming(false);
            setProblem(null);
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={MAX_LAYOUT_NAME}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("Layout name")}
            aria-label={t("Layout name")}
            className="type-body-sm h-9 rounded-control border border-border-strong bg-surface-base px-2.5 text-text-primary"
          />
          <div className="flex gap-1.5">
            <button type="submit" className="type-label h-8 flex-1 rounded-control bg-accent text-text-on-accent hover:bg-accent-hover">
              {t("Save")}
            </button>
            <button type="button" className="type-label h-8 flex-1 rounded-control text-text-secondary hover:bg-surface-hover" onClick={() => setNaming(false)}>
              {t("Cancel")}
            </button>
          </div>
          {problem !== null && <p role="alert" className="type-label text-negative">{problem}</p>}
        </form>
      ) : (
        <button type="button" className={row} onClick={() => setNaming(true)}>
          <Plus size={16} strokeWidth={1.5} aria-hidden />
          {t("Save this layout")}
        </button>
      )}
    </div>
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
  const t = useT();
  const pathname = usePathname();
  const routes = useRef<HTMLDivElement>(null);

  /* On a screen too short for every route, the list scrolls; keep the lit
     one in it. Only the rail's own list moves — never the shell. */
  useEffect(() => {
    const list = routes.current;
    const link = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !link) return;
    const box = list.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.top < box.top) list.scrollTop -= box.top - item.top + 8;
    else if (item.bottom > box.bottom) list.scrollTop += item.bottom - box.bottom + 8;
  }, [pathname]);

  return (
    <nav
      aria-label={t("Primary")}
      data-icons={icons ? "true" : "false"}
      className={cn(
        "group/rail relative z-20 min-h-0 flex-col border-r border-border-subtle bg-surface-base",
        className,
      )}
    >
      <div className="flex h-[var(--header-h)] shrink-0 items-center px-[11px]">
        <Link
          href="/"
          aria-label={t("Elyra home")}
          className="relative inline-flex size-[42px] shrink-0 items-center justify-center overflow-hidden rounded-pill border border-border-subtle"
        >
          <Image
            src="/elyra-public-avatar.png"
            alt=""
            width={42}
            height={42}
            priority
            className="size-full object-cover"
          />
        </Link>
      </div>

      <div ref={routes} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 short:py-2">
        <NavList icons={icons} />
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border-subtle px-2.5 py-3 short:gap-0.5 short:py-2">
        <ExpandToggle icons={icons} />
        <SettingsMenu />
        <RailAccount icons={icons} />
      </div>
    </nav>
  );
}
