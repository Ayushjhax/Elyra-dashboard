"use client";

import { AgentPanel } from "@/components/agent/AgentPanel";
import { NavList } from "@/components/shell/NavRail";
import { SheetAccount } from "@/components/shell/RailAccount";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useElyraStore } from "@/lib/store";

/**
 * Below 1280px the agent is a drawer rather than a column. The panel inside is
 * the same component the column renders and reads the same store, so the
 * conversation, a request in flight and a half-typed message are all there
 * whichever way it is reached.
 */
export function AgentDrawer() {
  const open = useElyraStore((state) => state.agentDrawerOpen);
  const setOpen = useElyraStore((state) => state.setAgentDrawerOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        side="right"
        surface="bare"
        showClose={false}
        aria-describedby="agent-drawer-help"
        className="w-[min(420px,calc(100vw-24px))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Elyra intelligence</DialogTitle>
          <DialogDescription id="agent-drawer-help">
            Ask Elyra about the selected market and your account, and review
            what the agent has done.
          </DialogDescription>
        </DialogHeader>
        <AgentPanel onClose={() => setOpen(false)} className="min-h-0 flex-1" />
      </DialogContent>
    </Dialog>
  );
}

/** Below 640px there is no rail; this is every route, as a sheet. */
export function NavSheet() {
  const open = useElyraStore((state) => state.navSheetOpen);
  const setOpen = useElyraStore((state) => state.setNavSheetOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent side="left" aria-describedby="nav-sheet-help">
        <DialogHeader>
          <DialogTitle>Go to</DialogTitle>
          <DialogDescription id="nav-sheet-help">Every section of the terminal.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <NavList showLabels onNavigate={() => setOpen(false)} />
          {/* No rail on a phone, so the account the rail's avatar opens is here. */}
          <div className="mt-3 border-t border-border-subtle pt-3">
            <SheetAccount onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
