"use client";

import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { CoinMark } from "@/components/ui/CoinMark";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatQty, formatUsd } from "@/lib/format";
import { truncateAddress } from "@/lib/solana/address";
import type { TokenBalance } from "@/lib/wallet/types";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What the wallet holds.

   Two rules govern every number here.

   A value that is not known is absent, never zero. A token with no price
   shows a dash and is counted in the "not included" line at the bottom, so
   the total is never quietly smaller than the holdings.

   An unverified token is shown and never counted. Airdropping a mint named
   "USDC" at a wallet costs a few cents, and a panel that adds one into a
   total can be made to display whatever figure the attacker chose. They are
   marked rather than hidden, because they are genuinely in the wallet.
--------------------------------------------------------------------------- */

/** How many decimals to show, given how large the number is. */
function tokenDecimals(amount: number): number {
  if (amount >= 1_000) return 2;
  if (amount >= 1) return 4;
  return 6;
}

function TokenRow({ token }: { token: TokenBalance }) {
  const symbol = token.symbol ?? truncateAddress(token.mint, 4, 4);
  const suspect = !token.verified;

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <CoinMark symbol={symbol} logo={token.icon} size={20} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="type-data truncate text-text-primary">{symbol}</span>
          {suspect && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldAlert
                  size={13}
                  strokeWidth={1.5}
                  className="shrink-0 text-negative"
                  aria-label="Unverified token"
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                Unverified mint. Shown because it is in the wallet, excluded
                from the total because anyone can mint a token using a name
                that is already taken.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="type-label truncate text-text-muted">
          {token.symbol === null ? token.mint : (token.name ?? token.mint)}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="type-data-sm tabular-nums text-text-primary">
          {formatQty(token.amount, tokenDecimals(token.amount))}
        </span>
        <span className="type-label tabular-nums text-text-muted">
          {token.usdValue === null ? "—" : formatUsd(token.usdValue)}
        </span>
      </div>
    </li>
  );
}

export function WalletBalances({ wallet }: { wallet: WalletDashboard }) {
  const snapshot = wallet.snapshot;

  if (wallet.unconfigured) {
    return (
      <section className="px-3 py-4">
        <div className="rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2">
          <p className="type-label text-negative">Solana RPC not configured</p>
          <p className="type-label mt-0.5 text-text-muted">
            Set <code>SOLANA_RPC_URL</code> in the environment to a
            dedicated RPC endpoint. There is deliberately no public fallback:
            an endpoint that rate-limits under a polling dashboard would show
            intermittent empty balances with nothing to point at.
          </p>
        </div>
      </section>
    );
  }

  if (snapshot === null) {
    return (
      <section className="flex flex-col gap-2 px-3 py-3">
        {wallet.error !== null ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={14}
                strokeWidth={1.5}
                aria-hidden
                className="mt-0.5 shrink-0 text-negative"
              />
              <p className="type-label break-words text-text-muted">{wallet.error}</p>
            </div>
            <Button size="sm" variant="quiet" onClick={wallet.refetch} className="self-start">
              <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
              Retry
            </Button>
          </div>
        ) : (
          /* Loading. Three rows at the height real rows will occupy, so the
             panel does not jump when they land. */
          <>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton h-9 w-full rounded-card" aria-hidden />
            ))}
          </>
        )}
      </section>
    );
  }

  const { uncounted } = snapshot;
  const excluded = uncounted.unpriced + uncounted.unverified;

  return (
    <section className="flex flex-col">
      {/* The total, and what it is made of. */}
      <div className="flex flex-col gap-1 border-b border-border-subtle px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <Eyebrow>Total</Eyebrow>
          {wallet.stale && (
            <span className="type-label text-negative">last known</span>
          )}
        </div>
        <span className="type-price tabular-nums text-text-primary">
          {snapshot.usdValue === null ? "—" : formatUsd(snapshot.usdValue)}
        </span>
        {snapshot.usdValue === null && (
          <p className="type-label text-text-muted">
            The SOL price is unavailable, so a total cannot be computed. The
            balances below are current.
          </p>
        )}
      </div>

      <ul className="list-none">
        {/* Native SOL first, always, even at zero: it is the account, not a
            holding, and its absence would read as a failed load. */}
        <li className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <CoinMark symbol="SOL" size={20} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="type-data text-text-primary">SOL</span>
            <span className="type-label text-text-muted">Solana</span>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="type-data-sm tabular-nums text-text-primary">
              {formatQty(snapshot.sol, 4)}
            </span>
            <span className="type-label tabular-nums text-text-muted">
              {snapshot.solUsd === null ? "—" : formatUsd(snapshot.sol * snapshot.solUsd)}
            </span>
          </div>
        </li>

        {snapshot.tokens.map((token) => (
          <TokenRow key={token.mint} token={token} />
        ))}
      </ul>

      {snapshot.tokens.length === 0 && (
        <p className="type-label px-3 py-3 text-text-muted">
          No SPL tokens with a balance.
        </p>
      )}

      {/* A capped list must not read as a complete one. The total above still
          counts every holding — only the rows are limited. */}
      {snapshot.tokenCount > snapshot.tokens.length && (
        <p className="type-label border-t border-border-subtle px-3 py-2 text-text-muted">
          Showing the {snapshot.tokens.length} largest of {snapshot.tokenCount}{" "}
          holdings. The total above includes all of them.
        </p>
      )}

      {excluded > 0 && (
        <p className="type-label border-t border-border-subtle px-3 py-2 text-text-muted">
          {excluded} holding{excluded === 1 ? "" : "s"} not included in the
          total
          {uncounted.unverified > 0 && ` — ${uncounted.unverified} unverified`}
          {uncounted.unpriced > 0 && ` — ${uncounted.unpriced} with no price`}.
        </p>
      )}

      <p
        className={cn(
          "type-label border-t border-border-subtle px-3 py-2 text-text-muted",
        )}
      >
        SOL priced by Pyth; SPL tokens priced and named by Jupiter. Read at
        slot {snapshot.slot.toLocaleString("en-US")}.
      </p>
    </section>
  );
}
