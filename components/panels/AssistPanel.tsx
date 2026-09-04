"use client";

import { useState } from "react";
import { AgentChatPanel } from "@/components/panels/AgentChatPanel";
import { SignalPanel } from "@/components/panels/SignalPanel";
import { AmbientGlow } from "@/components/ui/Glow";
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

  const tabs: Array<{ value: Surface; label: string; badge?: number }> = [
    { value: "chat", label: "Chat" },
    { value: "signals", label: "Signals", badge: ACTIVE_SIGNALS },
  ];

  return (
    <section
      role="region"
      aria-label="Assistant"
      className="flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]"
    >
      <div
        role="tablist"
        aria-label="Assistant surface"
        className={cn(
          "relative isolate flex shrink-0 items-center gap-1 overflow-hidden rounded-panel",
          "rim border border-border-subtle bg-surface-panel p-1",
        )}
      >
        <AmbientGlow
          tone="agent"
          breathe
          className="-top-[120%] left-1/2 h-[300%] w-[70%] -translate-x-1/2"
        />

        {tabs.map((tab) => {
          const active = tab.value === surface;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`assist-${tab.value}`}
              onClick={() => setSurface(tab.value)}
              className={cn(
                "type-label inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control px-3",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                active
                  ? "fill-active bg-surface-active text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    "type-data-sm rounded-pill px-1.5",
                    active
                      ? "fill-accent bg-accent text-text-on-accent shadow-lift-accent"
                      : "bg-surface-raised text-text-muted",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
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
        <SignalPanel />
      </div>
    </section>
  );
}
