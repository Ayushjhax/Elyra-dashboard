"use client";

import {
  Activity as ActivityIcon,
  Bot,
  Eye,
  Menu,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActivityPanel } from "@/components/panels/ActivityPanel";
import { AgentChatPanel } from "@/components/panels/AgentChatPanel";
import { AssistPanel } from "@/components/panels/AssistPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";
import { SignalPanel } from "@/components/panels/SignalPanel";
import { WatchlistPanel } from "@/components/panels/WatchlistPanel";
import { NavList } from "@/components/shell/NavRail";
import { useElyraStore, type MobilePanel } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Below 1280px the right column becomes a drawer; below 900px column 2 becomes
 * a sheet; below 640px everything reachable moves into a bottom tab bar. The
 * panels themselves are unchanged — only where they are mounted differs.
 */

/** Escape and the overlay both dismiss these, but touch needs a target too. */
function SurfaceBar({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1">
      <Eyebrow>{label}</Eyebrow>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${label.toLowerCase()}`}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-chip",
          "text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <X size={16} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
export function RightDrawer() {
  const open = useElyraStore((state) => state.rightDrawerOpen);
  const setOpen = useElyraStore((state) => state.setRightDrawerOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        side="right"
        showClose={false}
        aria-describedby="right-drawer-help"
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Signals and chat</DialogTitle>
          <DialogDescription id="right-drawer-help">
            The signal suggestions and the agent chat, as a drawer.
          </DialogDescription>
        </DialogHeader>
        <SurfaceBar label="Signals and chat" onClose={() => setOpen(false)} />
        {/* The drawer is narrower than the column it stands in for, so the
            stacked form would be tighter still. Same tabs, same reasoning. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <AssistPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeftSheet() {
  const open = useElyraStore((state) => state.leftSheetOpen);
  const setOpen = useElyraStore((state) => state.setLeftSheetOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        side="left"
        showClose={false}
        aria-describedby="left-sheet-help"
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Activity, watchlist and automation</DialogTitle>
          <DialogDescription id="left-sheet-help">
            Column two, as a sheet.
          </DialogDescription>
        </DialogHeader>
        <SurfaceBar label="Column two" onClose={() => setOpen(false)} />
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-[var(--gap-shell)]">
          <ActivityPanel />
          <WatchlistPanel />
          <AutomationPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NavSheet() {
  const open = useElyraStore((state) => state.navSheetOpen);
  const setOpen = useElyraStore((state) => state.setNavSheetOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent side="bottom" aria-describedby="nav-sheet-help">
        <DialogHeader>
          <DialogTitle>Go to</DialogTitle>
          <DialogDescription id="nav-sheet-help">
            The six sections of the terminal.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <NavList showLabels onNavigate={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MOBILE_PANELS: {
  value: Exclude<MobilePanel, null>;
  label: string;
  icon: LucideIcon;
  title: string;
  render: () => React.ReactNode;
}[] = [
  {
    value: "activity",
    label: "Activity",
    icon: ActivityIcon,
    title: "Activity",
    render: () => <ActivityPanel />,
  },
  {
    value: "watchlist",
    label: "Watchlist",
    icon: Eye,
    title: "Watchlist",
    render: () => <WatchlistPanel />,
  },
  {
    value: "signals",
    label: "Signals",
    icon: Sparkles,
    title: "Signal suggestion",
    render: () => <SignalPanel />,
  },
  {
    value: "chat",
    label: "Chat",
    icon: Bot,
    title: "Agentic chat",
    render: () => <AgentChatPanel />,
  },
];

export function MobilePanelSheet() {
  const panel = useElyraStore((state) => state.mobilePanel);
  const setPanel = useElyraStore((state) => state.setMobilePanel);
  const active = MOBILE_PANELS.find((entry) => entry.value === panel);

  return (
    <Dialog open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
      <DialogContent
        side="bottom"
        showClose={false}
        aria-describedby="mobile-panel-help"
        className="h-[70dvh] border-0 bg-transparent p-0 shadow-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{active?.title ?? "Panel"}</DialogTitle>
          <DialogDescription id="mobile-panel-help">
            {active?.title ?? "Panel"}, as a sheet over the terminal.
          </DialogDescription>
        </DialogHeader>
        <SurfaceBar
          label={active?.title ?? "Panel"}
          onClose={() => setPanel(null)}
        />
        <div className="flex min-h-0 flex-1 flex-col">{active?.render()}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Only rendered below 640px, where the layout stacks. */
export function MobileTabBar() {
  const panel = useElyraStore((state) => state.mobilePanel);
  const setPanel = useElyraStore((state) => state.setMobilePanel);
  const setNavSheetOpen = useElyraStore((state) => state.setNavSheetOpen);

  return (
    <nav
      aria-label="Panels"
      className={cn(
        "flex items-stretch justify-between gap-1 compact:hidden",
        "rounded-panel border border-border-subtle bg-surface-panel p-1",
      )}
    >
      <button
        type="button"
        onClick={() => setNavSheetOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control py-1.5",
          "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <Menu size={18} strokeWidth={1.5} aria-hidden />
        <span className="type-label">Menu</span>
      </button>

      {MOBILE_PANELS.map(({ value, label, icon: Icon }) => {
        const active = panel === value;
        return (
          <button
            key={value}
            type="button"
            aria-haspopup="dialog"
            aria-pressed={active}
            onClick={() => setPanel(active ? null : value)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control py-1.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              active
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden />
            <span className="type-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
