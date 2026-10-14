"use client";

import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { ElyraMark } from "@/components/ui/ElyraMark";
import { AccountMenu } from "@/components/shell/status/AccountMenu";
import { ConnectionStatus } from "@/components/shell/status/ConnectionStatus";
import { NotificationsMenu } from "@/components/shell/status/NotificationsMenu";
import { TelegramLink } from "@/components/shell/status/TelegramLink";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The application header: one row above the workspace, on every route.

   Fixed rather than scrolling with the page, so search, status and the
   account are always one move away and the agent panel can stick directly
   under it. Every status value in it is real — connection health is computed
   from the two upstreams, and the account control never shows a balance it
   does not have.

   Below 640px there is no rail, so the menu button here is the way to every
   route; below 1280px the agent is a drawer, and the Elyra button opens it.
--------------------------------------------------------------------------- */

const ICON_BUTTON = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-control",
  "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:bg-surface-hover hover:text-text-primary",
);

function SearchTrigger() {
  const setCommandOpen = useElyraStore((state) => state.setCommandOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          "hidden h-10 w-full max-w-[400px] items-center gap-2.5 rounded-card border border-border-strong",
          "bg-surface-panel px-3 text-left text-text-muted mid:flex",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:border-accent-quiet hover:text-text-secondary",
        )}
      >
        <Search size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
        <span className="type-body-sm flex-1 truncate">Search anything</span>
        <kbd className="type-data-sm shrink-0 rounded-chip border border-border-strong px-1.5 text-text-muted">
          ⌘ K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        aria-haspopup="dialog"
        aria-label="Search"
        className={cn(ICON_BUTTON, "mid:hidden")}
      >
        <Search size={18} strokeWidth={1.5} aria-hidden />
      </button>
    </>
  );
}

export function AppHeader() {
  const setNavSheetOpen = useElyraStore((state) => state.setNavSheetOpen);
  const setAgentDrawerOpen = useElyraStore((state) => state.setAgentDrawerOpen);
  const agentPending = useElyraStore((state) => state.agentPending);

  return (
    <header
      className={cn(
        "flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-border-subtle",
        "bg-surface-base px-4 compact:gap-4 compact:px-[var(--pad-workspace)]",
      )}
    >
      {/* Below 640px the rail is a sheet, and this is the way into it. */}
      <button
        type="button"
        onClick={() => setNavSheetOpen(true)}
        aria-haspopup="dialog"
        aria-label="Open navigation"
        className={cn(ICON_BUTTON, "-ml-1.5 compact:hidden")}
      >
        <Menu size={18} strokeWidth={1.5} aria-hidden />
      </button>

      <Link
        href="/"
        aria-label="Elyra home"
        className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.03em] text-text-primary"
      >
        elyra<span className="text-accent">.</span>
      </Link>

      <span aria-hidden className="hidden h-6 w-px bg-border-subtle full:block" />
      <span className="type-body-sm hidden whitespace-nowrap text-text-secondary full:inline">
        Trading workspace
      </span>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <SearchTrigger />
      </div>

      <div className="flex shrink-0 items-center gap-1 compact:gap-2">
        <ConnectionStatus className="hidden full:flex" />
        <div className="hidden compact:block">
          <TelegramLink />
        </div>
        <NotificationsMenu />
        {/* The agent is a column from 1280px. Below it, this opens the drawer. */}
        <button
          type="button"
          onClick={() => setAgentDrawerOpen(true)}
          aria-haspopup="dialog"
          aria-label={agentPending ? "Open Elyra, working on a request" : "Open Elyra"}
          className={cn(ICON_BUTTON, "relative full:hidden")}
        >
          <ElyraMark size={28} />
          {agentPending && (
            <span aria-hidden className="absolute right-2 top-2 size-1.5 rounded-pill bg-agent-accent" />
          )}
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
