"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The way to Telegram, which is the app's second surface onto the same agent.

   Three states, and the control says which it is in rather than looking the
   same and behaving differently:

     linked        → opens the bot in Telegram
     not linked    → goes to Connections, where a link code is issued
     unconfigured  → disabled, and the tooltip says the bot is not set up

   A disabled control with an explanation beats an enabled one that fails.
--------------------------------------------------------------------------- */

interface LinkState {
  linked: boolean;
  botUsername: string | null;
  /** False once the first attempt settles; the icon is inert until then. */
  loading: boolean;
}

const INITIAL: LinkState = { linked: false, botUsername: null, loading: true };

const control = cn(
  "inline-flex size-7 items-center justify-center rounded-control",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

export function TelegramLink() {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [state, setState] = useState<LinkState>(INITIAL);

  const signedIn = auth.ready && auth.authenticated;

  /* Fetches and returns; never sets state. Every setState below sits inside
     an awaited continuation behind a cancel flag. */
  const load = useCallback(async (): Promise<LinkState> => {
    if (!signedIn) return { linked: false, botUsername: null, loading: false };
    try {
      const response = await authedFetch("/api/telegram/link");
      if (!response.ok) return { linked: false, botUsername: null, loading: false };
      const body = (await response.json()) as {
        linked: boolean;
        botUsername: string | null;
      };
      return { linked: body.linked, botUsername: body.botUsername, loading: false };
    } catch {
      return { linked: false, botUsername: null, loading: false };
    }
  }, [authedFetch, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const icon = <Send size={16} strokeWidth={1.5} aria-hidden />;

  /* Telegram is optional for the whole app, so an unconfigured bot is a
     normal state and not an error. */
  if (!state.loading && state.botUsername === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(control, "cursor-not-allowed text-text-muted opacity-50")}>
            {icon}
            <span className="sr-only">Telegram is not configured</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Telegram is not configured for this deployment
        </TooltipContent>
      </Tooltip>
    );
  }

  const linked = state.linked && state.botUsername !== null;
  const href = linked ? `https://t.me/${state.botUsername}` : "/agent";
  const label = linked ? "Open Elyra in Telegram" : "Connect Telegram";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          {...(linked ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={cn(
            control,
            "text-accent-quiet hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {icon}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
