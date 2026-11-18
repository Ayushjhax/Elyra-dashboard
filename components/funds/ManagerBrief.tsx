"use client";

import { useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { HowToConnect } from "@/components/connections/AgentKeysCard";
import { Button } from "@/components/ui/Button";
import { useCopy } from "@/lib/clipboard";

/* ---------------------------------------------------------------------------
   How the person puts an AI to work on a fund: the connection (their agent
   key, over MCP), and the standing instructions to give it. The
   instructions are Elyra's words, for the person's own agent; the fund's
   rules are enforced by Elyra whatever the agent is told.
--------------------------------------------------------------------------- */

const subscribeNever = () => () => {};

export function useOrigin(): string {
  return useSyncExternalStore(subscribeNever, () => window.location.origin, () => "https://api.getelyra.xyz");
}

export function managerPrompt(name: string): string {
  return [
    `You are the portfolio manager of "${name}", an AI fund on Elyra, connected through the Elyra MCP server.`,
    "Each time you run:",
    "1. Call fund_overview. Read the owner's brief and the charter first, then the book, the open positions and the blockers.",
    "2. If canOpen is false, write a short fund_write_note saying why you are waiting, and stop.",
    "3. Use Elyra's market tools (get_market_snapshot, get_ohlcv_summary, get_funding_rate, perp_market) to form a view on the charter's markets.",
    "4. Close positions whose reason has gone with fund_close_position, giving the reason.",
    "5. Open at most one new position per run with fund_open_position, never larger than maxNewPositionUsd, always with a take-profit and a stop-loss, and a one-paragraph thesis.",
    "6. End with fund_write_note: your view, what you did and what would change your mind.",
    "Every order is held to the charter by Elyra. A refusal lists its reasons — read them and adjust; do not retry the same order.",
  ].join("\n");
}

export function CopyBlock({ text, label }: { text: string; label: string }) {
  const { state, copy } = useCopy();
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
      <pre className="type-label max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-text-secondary">{text}</pre>
      <div>
        <Button size="xs" variant="quiet" onClick={() => void copy(text)} aria-label={label}>
          {state === "copied" ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Shown once, straight after a key is made for a fund: the key is never shown again. */
export function FreshKey({ keyText, fundName }: { keyText: string; fundName: string }) {
  const origin = useOrigin();
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-text-primary">
        This is the manager&apos;s key. It is shown once — Elyra keeps only its hash. Connect your agent with it, then give the agent its instructions.
      </p>
      <HowToConnect origin={origin} keyText={keyText} />
      <p className="type-label text-text-secondary">Standing instructions for the agent</p>
      <CopyBlock text={managerPrompt(fundName)} label="Copy the manager's instructions" />
      <p className="type-label text-text-muted">
        Run the agent on a schedule — every hour, say — and the fund is managed while you are away. Elyra marks it, holds it to its charter and halts it at its
        drawdown limit whether or not the agent is running.
      </p>
    </div>
  );
}
