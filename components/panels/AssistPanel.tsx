"use client";

import { useState } from "react";
import { Bot, Landmark, Sparkles, type LucideIcon } from "lucide-react";
import { AgentChatPanel } from "@/components/panels/AgentChatPanel";
import { SmartMoneySignalPanel } from "@/components/panels/SmartMoneySignalPanel";
import { SmartMoneyPanel } from "@/components/panels/SmartMoneyPanel";
import { AmbientGlow } from "@/components/ui/Glow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Chat, signals and smart money, sharing one column.

   They used to be stacked — signals above, chat below — which gave each about
   half the height and left both cramped: the chat showed two turns and the
   signal cards were cut off mid-card. Only one of the three is ever being
   read at a time, so they share the full column and a tab switches between
   them.

   No per-tab badge. An earlier version showed a count on the Signals tab
   read from a mock module, so the number described a fixture rather than the
   live feed — a count that is confidently wrong is worse than no count.
   Each panel already reports its own total in its own header, from its own
   data; duplicating that honestly here would mean wiring live state up into
   this component just to repeat what is already shown one level down.

   All three panels are rendered and two are hidden rather than unmounted.
   The chat holds scroll position, an in-flight request and a half-typed
   message, and remounting it on every tab switch would throw all three away.
--------------------------------------------------------------------------- */

type Surface = "chat" | "signals" | "smart";

export function AssistPanel() {
  const [surface, setSurface] = useState<Surface>("chat");

  /* The same marks these surfaces carry in the palette and in the bottom tab
     bar — Bot is the machine, Sparkles is a raised setup, Landmark is a
     regulatory filing — so a surface is recognisable by its icon wherever it
     is reached from. */
  const tabs: Array<{
    value: Surface;
    label: string;
    /** One line under the name in the tooltip — the only place it is written. */
    hint: string;
    icon: LucideIcon;
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
    },
    {
      value: "smart",
      label: "Smart money",
      hint: "Findings from SEC filings and institutional flow",
      icon: Landmark,
    },
  ];

  return (
    <section
      role="region"
      aria-label="Assistant"
      className="flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]"
    >
      {/* Icons alone, in a strip only as wide as they are.
          The names moved into tooltips — each surface is recognisable by its
          mark, and the row they used to take is a row of chat, signals or
          smart money instead. Same trade the nav rail makes when it
          collapses, and the tooltip is what carries the writeup in both
          places. */}
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
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="type-label block text-text-primary">
                  {tab.label}
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
        <SmartMoneySignalPanel />
      </div>

      <div
        id="assist-smart"
        role="tabpanel"
        aria-label="Smart money"
        hidden={surface !== "smart"}
        className={cn("min-h-0 flex-1 flex-col", surface === "smart" ? "flex" : "hidden")}
      >
        <SmartMoneyPanel />
      </div>
    </section>
  );
}
