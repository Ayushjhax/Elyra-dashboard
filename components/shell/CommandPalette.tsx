"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Maximize2,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { NAV_ITEMS } from "@/components/shell/NavRail";
import { CoinMark } from "@/components/ui/CoinMark";
import { ElyraMark } from "@/components/ui/ElyraMark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendToAgent } from "@/lib/agentChat";
import { useAssetSearch } from "@/lib/market/useAssetSearch";
import type { PythAsset } from "@/lib/market/pyth/types";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Search anything — ⌘K / Ctrl+K from anywhere.

   Three kinds of result, in the order they are most often wanted: markets
   (the same Pyth catalogue the watchlist picker searches, so the two can never
   offer different universes), pages, and workspace actions. Typing a question
   also offers to send it to Elyra as it is.

   One list, driven from the keyboard: arrows move, Enter runs, Escape closes.
   It is a combobox over a listbox, so the active row is announced without the
   input ever losing focus.
--------------------------------------------------------------------------- */

interface Command {
  id: string;
  group: "Markets" | "Pages" | "Actions";
  label: string;
  hint?: string;
  icon?: LucideIcon;
  asset?: PythAsset;
  run: () => void;
}

const MARKET_LIMIT = 6;

export function CommandPalette() {
  const open = useElyraStore((state) => state.commandOpen);
  const setOpen = useElyraStore((state) => state.setCommandOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showClose={false}
        aria-describedby="command-help"
        overlayClassName="command-glass-overlay"
        className="command-glass top-[12dvh] w-[min(600px,calc(100vw-32px))] max-h-[min(640px,calc(100dvh-24dvh))] -translate-y-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription id="command-help">
            Search markets, pages and workspace actions. Use the arrow keys to
            move and Enter to choose.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the query starts empty every time. */}
        {open && <CommandBody onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CommandBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useElyraAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const addToWatchlist = useElyraStore((state) => state.addToWatchlist);
  const widgetsOpen = useElyraStore((state) => state.widgetsOpen);
  const setWidgetsOpen = useElyraStore((state) => state.setWidgetsOpen);
  const agentOpen = useElyraStore((state) => state.agentOpen);
  const setAgentOpen = useElyraStore((state) => state.setAgentOpen);
  const focusMode = useElyraStore((state) => state.focusMode);
  const setFocusMode = useElyraStore((state) => state.setFocusMode);
  const resetLayout = useElyraStore((state) => state.resetLayout);
  const revealAgent = useElyraStore((state) => state.revealAgent);

  const needle = query.trim().toLowerCase();
  const { assets, status } = useAssetSearch(query, null, true);

  const commands = useMemo<Command[]>(() => {
    const goHome = () => {
      if (pathname !== "/") router.push("/");
    };

    const markets: Command[] = assets.slice(0, MARKET_LIMIT).map((asset) => ({
      id: `asset-${asset.id}`,
      group: "Markets",
      label: asset.symbol,
      hint: asset.name,
      asset,
      run: () => {
        setSelectedAssetId(asset.id);
        addToWatchlist(asset.id);
        goHome();
      },
    }));

    const pages: Command[] = NAV_ITEMS.filter(
      (item) => needle === "" || item.label.toLowerCase().includes(needle),
    ).map((item) => ({
      id: `page-${item.href}`,
      group: "Pages",
      label: item.label,
      icon: item.icon,
      run: () => router.push(item.href),
    }));

    const actions: Command[] = [
      {
        id: "action-widgets",
        group: "Actions" as const,
        label: widgetsOpen ? "Hide widgets" : "Show widgets",
        icon: PanelLeft,
        run: () => setWidgetsOpen(!widgetsOpen),
      },
      {
        id: "action-agent",
        group: "Actions" as const,
        label: agentOpen ? "Hide Elyra" : "Show Elyra",
        icon: PanelRight,
        run: () => (agentOpen ? setAgentOpen(false) : revealAgent()),
      },
      {
        id: "action-focus",
        group: "Actions" as const,
        label: focusMode ? "Exit focus mode" : "Focus mode",
        icon: Maximize2,
        run: () => {
          setFocusMode(!focusMode);
          goHome();
        },
      },
      {
        id: "action-reset",
        group: "Actions" as const,
        label: "Reset layout",
        icon: RotateCcw,
        run: resetLayout,
      },
    ].filter((command) => needle === "" || command.label.toLowerCase().includes(needle));

    /* A query that is a question goes to the agent as typed. */
    const ask: Command[] =
      query.trim().length > 2
        ? [
            {
              id: "action-ask",
              group: "Actions",
              label: `Ask Elyra: “${query.trim()}”`,
              icon: Sparkles,
              run: () => {
                revealAgent();
                if (!auth.authenticated) {
                  auth.login();
                  return;
                }
                void sendToAgent(query, auth.getAccessToken);
              },
            },
          ]
        : [];

    return [...markets, ...pages, ...ask, ...actions];
  }, [
    addToWatchlist,
    agentOpen,
    assets,
    auth,
    focusMode,
    needle,
    pathname,
    query,
    resetLayout,
    revealAgent,
    router,
    setAgentOpen,
    setFocusMode,
    setSelectedAssetId,
    setWidgetsOpen,
    widgetsOpen,
  ]);

  /* The active row resets whenever the list it indexes changes shape. */
  const current = Math.min(active, Math.max(commands.length - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onDone();
    command.run();
  };

  const groups = ["Markets", "Pages", "Actions"] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-3 pb-2">
      <div className="command-search flex items-center gap-3 rounded-card border px-3">
        <Image src="/elyra-public-avatar.png" alt="" aria-hidden width={28} height={28} className="shrink-0 rounded-pill" />
        <input
          data-command-input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={commands[current] ? `cmd-${commands[current].id}` : undefined}
          aria-label="Search markets, pages and actions"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, commands.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(commands[current]);
            }
          }}
          placeholder="Search markets, pages, or ask Elyra…"
          className="type-body h-12 min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-muted"
        />
        <button type="button" aria-label="Close search" onClick={onDone} className="flex size-10 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover">
          <kbd className="type-data-sm rounded-chip border border-border-strong px-1.5 py-0.5">Esc</kbd>
        </button>
      </div>
      </div>

      <ul
        ref={listRef}
        id="command-list"
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 list-none overflow-y-auto px-3 pb-3"
      >
        {commands.length === 0 && (
          <li className="type-body-sm px-3 py-6 text-center text-text-secondary">
            {status === "loading" ? "Searching…" : `Nothing matches “${query.trim()}”.`}
          </li>
        )}
        {groups.map((group) => {
          const rows = commands
            .map((command, index) => ({ command, index }))
            .filter(({ command }) => command.group === group);
          if (rows.length === 0) return null;
          return (
            <li key={group} role="presentation">
              <p className="type-eyebrow px-3 pb-1 pt-2 text-text-muted">{group}</p>
              <ul role="group" aria-label={group} className="list-none">
                {rows.map(({ command, index }) => {
                  const Icon = command.icon;
                  const selected = index === current;
                  return (
                    <li
                      key={command.id}
                      id={`cmd-${command.id}`}
                      role="option"
                      aria-selected={selected}
                      data-index={index}
                      onPointerMove={() => setActive(index)}
                      onClick={() => run(command)}
                      className={cn(
                        "command-result flex h-11 cursor-pointer items-center gap-3 rounded-control px-3",
                        selected ? "command-result-selected text-text-primary" : "text-text-secondary",
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center">
                      {command.id === "action-ask" || command.id === "action-agent" ? (
                        <ElyraMark size={24} />
                      ) : command.asset ? (
                        <CoinMark symbol={command.asset.symbol} logo={command.asset.logo} size={20} />
                      ) : Icon ? (
                        <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
                      ) : null}
                      </span>
                      <span className="type-body-sm min-w-0 truncate text-text-primary">
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="type-label min-w-0 truncate text-text-muted">
                          {command.hint}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="type-label flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-6 py-3 text-text-muted">
        <span>↑ ↓ Navigate <span className="ml-3">↵ Open</span></span>
        <span>Elyra search</span>
      </div>
    </div>
  );
}
