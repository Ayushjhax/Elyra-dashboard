"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePrices } from "@/lib/market/usePrices";
import { health, priceStateOf, rpcStateOf, type HealthTone } from "@/lib/wallet/health";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Whether the terminal's two upstreams are answering, in words.

   The score is `lib/wallet/health.ts`'s, computed from the Solana RPC (every
   balance) and Pyth (every price) — never assumed. The label says which state
   that adds up to; the tooltip names the weakest link and the score, because
   "degraded" tells you something is wrong and the reason tells you what.
--------------------------------------------------------------------------- */

const STATE: Record<HealthTone, { label: string; dot: string }> = {
  positive: { label: msg("Systems connected"), dot: "bg-positive" },
  warning: { label: msg("Partially connected"), dot: "bg-accent" },
  negative: { label: msg("Connection issues"), dot: "bg-negative" },
  unknown: { label: msg("Connecting"), dot: "bg-text-muted" },
};

export function ConnectionStatus({ className }: { className?: string }) {
  const t = useT();
  const wallet = useWalletDashboard();
  /* An empty id list adds no subscription; it reads the shared feed's status,
     which the chart keeps alive for the life of the session. */
  const prices = usePrices([]);

  const score = health({
    rpc: rpcStateOf({
      unconfigured: wallet.unconfigured,
      isLoading: wallet.isLoading,
      error: wallet.error,
      stale: wallet.stale,
      hasSnapshot: wallet.snapshot !== null,
    }),
    prices: priceStateOf(prices.status),
    latencyMs: wallet.latencyMs,
  });
  const state = STATE[score.tone];
  /* The slow-RPC reason carries its latency after the words: translate the words. */
  const slow = msg("Solana RPC is slow to answer");
  const reason = score.reason.startsWith(slow) ? t(slow) + score.reason.slice(slow.length) : t(score.reason);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={`${t(state.label)}. ${reason}`}
          className={cn("flex items-center gap-2 rounded-control px-2 py-1", className)}
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", state.dot)} />
          <span className="type-label whitespace-nowrap text-text-secondary">{t(state.label)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="block">{reason}</span>
        {score.score !== null && (
          <span className="type-data-sm block text-text-muted">{t("Health {score}%", { score: score.score })}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
