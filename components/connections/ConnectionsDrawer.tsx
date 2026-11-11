"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link2, Lock, LogIn, ShieldCheck } from "lucide-react";
import { AgentKeysCard } from "@/components/connections/AgentKeysCard";
import { BinanceCard, HyperliquidCard, type ExchangeState } from "@/components/connections/ExchangeCards";
import { PolymarketCard, type PredictionState } from "@/components/connections/PolymarketCard";
import { InlineNote, primaryAction, useAccountFetch } from "@/components/connections/primitives";
import { TelegramCard } from "@/components/connections/TelegramCard";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Connections: what Elyra can read on the person's behalf.

   A route drawer like Dashboard and Portfolio — the route column beside the
   chart from 900px, the whole body below it — so Escape, focus return and
   the fixed header come from RouteDrawer rather than being rebuilt here.

   Every connection is read-only, and that is enforced rather than promised:
   the Binance client can only sign GETs and a key that can trade is refused
   before it is stored (lib/exchange/binance.ts); Hyperliquid and Polymarket
   are read by address. The strip under the header and the line at the foot
   say only that.

   The cards remount per signed-in account (`key` below), so a response for
   the account that was signed in a moment ago can never land in the next
   one's card.
--------------------------------------------------------------------------- */

export function ConnectionsDrawer() {
  return (
    <RouteDrawer
      label="Connections"
      icon={<Link2 size={26} strokeWidth={1.5} />}
      title="Connections"
      subtitle="Bring your accounts into Elyra"
    >
      <ReadOnlyStrip />
      <ConnectionsBody />
      <p className="type-label flex items-center justify-center gap-1.5 pb-[env(safe-area-inset-bottom)] pt-1 text-text-muted">
        <Lock size={12} strokeWidth={1.5} aria-hidden />
        Connection access stays read-only
      </p>
    </RouteDrawer>
  );
}

function ReadOnlyStrip() {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border-subtle px-3 py-2.5">
      <ShieldCheck size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-positive" />
      <p className="min-w-0">
        <span className="type-body-sm block font-medium text-text-primary">Read-only access</span>
        <span className="type-label block text-text-secondary">
          View balances and positions. Trading actions are unavailable here.
        </span>
      </p>
    </div>
  );
}

function ConnectionsBody() {
  const auth = useElyraAuth();

  if (!auth.available) {
    return (
      <Notice>
        <InlineNote>Sign-in is not configured on this deployment, so there is no account to connect anything to.</InlineNote>
      </Notice>
    );
  }

  if (!auth.ready) {
    return (
      <Notice>
        <p role="status" className="type-body-sm text-text-muted">
          Restoring your session…
        </p>
      </Notice>
    );
  }

  if (!auth.authenticated) {
    return (
      <Notice>
        <p className="type-body-sm text-text-secondary">
          Sign in to connect Telegram, Polymarket and your exchanges.
        </p>
        <button type="button" onClick={auth.login} className={cn(primaryAction, "mt-3 w-full")}>
          <LogIn size={15} strokeWidth={1.5} aria-hidden />
          Sign in
        </button>
      </Notice>
    );
  }

  return <ConnectionCards key={auth.account?.id ?? "account"} />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-panel border border-border-subtle bg-surface-raised p-4">{children}</div>;
}

/**
 * One connection-management read: loaded on mount, re-read on demand, and
 * only the newest answer kept — a slow reply to an earlier read never
 * overwrites a newer one.
 */
function useConnectionRead<T>(url: string): [T | null | "failed", () => Promise<void>] {
  const accountFetch = useAccountFetch();
  const [value, setValue] = useState<T | null | "failed">(null);
  const latest = useRef(0);

  const read = useCallback(
    async (signal?: AbortSignal): Promise<T | "failed"> => {
      try {
        const response = await accountFetch(url, { signal, cache: "no-store" });
        if (!response.ok) return "failed";
        return (await response.json()) as T;
      } catch {
        return "failed";
      }
    },
    [accountFetch, url],
  );

  useEffect(() => {
    const controller = new AbortController();
    const ticket = ++latest.current;
    void read(controller.signal).then((next) => {
      if (!controller.signal.aborted && ticket === latest.current) setValue(next);
    });
    return () => controller.abort();
  }, [read]);

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    const next = await read();
    if (ticket === latest.current) setValue(next);
  }, [read]);

  return [value, reload];
}

function ConnectionCards() {
  const feed = usePortfolio();
  const [prediction, reloadPrediction] = useConnectionRead<PredictionState>("/api/prediction/account");
  const [exchanges, reloadExchanges] = useConnectionRead<ExchangeState>("/api/exchanges");
  const exchangesId = useId();
  const agentsId = useId();
  const { refetch } = feed;

  /* A change is visible everywhere the account is read: the card's own
     state, and the shared portfolio that every other surface draws from. */
  const predictionChanged = useCallback(async () => {
    await reloadPrediction();
    refetch();
  }, [reloadPrediction, refetch]);

  const exchangesChanged = useCallback(async () => {
    await reloadExchanges();
    refetch();
  }, [reloadExchanges, refetch]);

  return (
    <>
      <TelegramCard />
      <PolymarketCard state={prediction} feed={feed} onChanged={predictionChanged} />

      <section aria-labelledby={exchangesId} className="flex flex-col gap-3 pt-2">
        <h2 id={exchangesId} className="type-eyebrow px-1 text-text-muted">
          Exchanges
        </h2>
        <HyperliquidCard state={exchanges} feed={feed} onChanged={exchangesChanged} />
        <BinanceCard state={exchanges} feed={feed} onChanged={exchangesChanged} />
      </section>

      <section aria-labelledby={agentsId} className="flex flex-col gap-3 pt-2">
        <h2 id={agentsId} className="type-eyebrow px-1 text-text-muted">
          AI agents
        </h2>
        <AgentKeysCard />
      </section>
    </>
  );
}
