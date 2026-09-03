"use client";

import { useState } from "react";
import { Bot, Sparkles, type LucideIcon } from "lucide-react";
import { AgentChatPanel } from "@/components/panels/AgentChatPanel";
import { EngineSignalPanel } from "@/components/panels/EngineSignalPanel";
import { AmbientGlow } from "@/components/ui/Glow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIGNALS } from "@/lib/mock/signals";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Chat and signals, sharing one column.

   They used to be stacked — signals above, chat below — which gave each about
   half the height and left both cramped: the chat showed two turns and the
   signal cards were cut off mid-card. Only one of the two is ever being read
   at a time, so they share the full column and a tab switches between them.

   Both panels are rendered and one is hidden rather than unmounted. The chat
   holds scroll position, an in-flight request and a half-typed message, and
   remounting it on every tab switch would throw all three away.
--------------------------------------------------------------------------- */

type Surface = "chat" | "signals";

const ACTIVE_SIGNALS = SIGNALS.filter((signal) => signal.status === "active").length;

export function AssistPanel() {
  const [surface, setSurface] = useState<Surface>("chat");

  /* The same two icons these surfaces carry in the palette and in the bottom
     tab bar — Bot is the machine, Sparkles is a raised setup — so a surface
     is recognisable by its mark wherever it is reached from. */
  const tabs: Array<{
    value: Surface;
    label: string;
    /** One line under the name in the tooltip — the only place it is written. */
    hint: string;
    icon: LucideIcon;
    badge?: number;
  }> = [
    {
      value: "chat",
      label: "Chat",
      hint: "Ask Elyra about the selected market",
      icon: Bot,
    },
    {
      value: "signals",
      label: "Signals",
      hint: "Setups the agent has raised, with its reasoning",
      icon: Sparkles,
      badge: ACTIVE_SIGNALS,
    },
  ];

  return (
    <section
      role="region"
      aria-label="Assistant"
      className="flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]"
    >
      {/* Icons alone, in a strip only as wide as they are.
          The names moved into tooltips — the two surfaces are recognisable by
          their marks, and the row they used to take is a row of chat or of
          signals instead. Same trade the nav rail makes when it collapses, and
          the tooltip is what carries the writeup in both places. */}
      <div
        role="tablist"
        aria-label="Assistant surface"
        className={cn(
          "relative isolate flex w-fit shrink-0 items-center gap-1 overflow-hidden rounded-panel",
          "rim border border-border-subtle bg-surface-panel p-1",
        )}
      >
        <AmbientGlow
          tone="agent"
          breathe
          className="-top-[120%] left-1/2 h-[300%] w-[140%] -translate-x-1/2"
        />

        {tabs.map((tab) => {
          const active = tab.value === surface;
          const Icon = tab.icon;
          return (
            <Tooltip key={tab.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`assist-${tab.value}`}
                  /* The button has no text of its own now, so this is the only
                     thing naming it. */
                  aria-label={tab.label}
                  onClick={() => setSurface(tab.value)}
                  className={cn(
                    "relative inline-flex size-8 shrink-0 items-center justify-center rounded-control",
                    "transition-colors duration-[var(--dur-fast)] ease-brand",
                    active
                      ? "fill-active bg-surface-active text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                  {/* The count is live information rather than a label, so it
                      stays — as a corner marker, which costs no width. */}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -right-0.5 -top-0.5 min-w-4 rounded-pill px-1",
                        "type-data-sm text-[10px] leading-4",
                        active
                          ? "fill-accent bg-accent text-text-on-accent shadow-lift-accent"
                          : "bg-surface-raised text-text-secondary",
                      )}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="type-label block text-text-primary">
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && ` · ${tab.badge} active`}
                </span>
                <span className="type-label block text-text-muted">{tab.hint}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* `hidden` rather than conditional rendering — see the note above. */}
      <div
        id="assist-chat"
        role="tabpanel"
        aria-label="Agentic chat"
        hidden={surface !== "chat"}
        /* `flex` so the Panel inside stretches to fill the column: as a plain
           block it would collapse to its content height. */
        className={cn("min-h-0 flex-1 flex-col", surface === "chat" ? "flex" : "hidden")}
      >
        <AgentChatPanel />
      </div>

      <div
        id="assist-signals"
        role="tabpanel"
        aria-label="Signals"
        hidden={surface !== "signals"}
        className={cn("min-h-0 flex-1 flex-col", surface === "signals" ? "flex" : "hidden")}
      >
        <EngineSignalPanel />
      </div>
    </section>
  );
}
