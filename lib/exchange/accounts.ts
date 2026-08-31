import "server-only";

import { decryptSecret } from "@/lib/crypto/credentials";
import { binancePortfolio } from "@/lib/exchange/binance";
import { hyperliquidPortfolio } from "@/lib/exchange/hyperliquid";
import type { PortfolioSource, SourceFailure } from "@/lib/exchange/types";
import { serviceClient } from "@/lib/supabase/server";
import type { ExchangeAccount, ExchangeId } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Turning stored credentials into readable accounts.

   The query below is the single place a user's exchange keys are loaded, and
   it filters by `user_id` in the query itself. That filter is the only thing
   separating one user's portfolio from another's: the service-role client
   bypasses RLS, and Privy means auth.uid() is null, so nothing in the
   database will catch a missing `.eq("user_id", ...)` here.

   `userId` must come from lib/auth/session.ts (web) or a telegram_links
   lookup (Telegram). Never from a request body or message text.
--------------------------------------------------------------------------- */

/** A connected exchange, as the UI describes it. No secret material. */
export interface ConnectionSummary {
  exchange: ExchangeId;
  label: string | null;
  keyLastFour: string | null;
  walletAddress: string | null;
  connectedAt: string;
}

/** Rows for one user. Every caller here goes through this function. */
async function accountRows(userId: string): Promise<ExchangeAccount[]> {
  const { data, error } = await serviceClient()
    .from("exchange_accounts")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;
  return data ?? [];
}

/** What the dashboard shows. Deliberately returns nothing decryptable. */
export async function listConnections(
  userId: string,
): Promise<ConnectionSummary[]> {
  const rows = await accountRows(userId);
  return rows.map((row) => ({
    exchange: row.exchange,
    label: row.label,
    keyLastFour: row.key_last_four,
    walletAddress: row.wallet_address,
    connectedAt: row.created_at,
  }));
}

/**
 * Readable sources for a user, plus any row that could not be turned into
 * one.
 *
 * A credential that fails to decrypt is reported rather than thrown: one bad
 * row must not hide the portfolio held at every other venue.
 */
export interface LoadedSources {
  sources: PortfolioSource[];
  failures: SourceFailure[];
}

export async function loadPortfolioSources(
  userId: string,
  /**
   * The session wallet, used when no Hyperliquid row exists. Hyperliquid
   * reads need only an address, so a user with a Privy wallet has a readable
   * Hyperliquid account without connecting anything.
   */
  sessionWallet: string | null = null,
): Promise<LoadedSources> {
  const rows = await accountRows(userId);
  const sources: PortfolioSource[] = [];
  const failures: LoadedSources["failures"] = [];

  for (const row of rows) {
    try {
      switch (row.exchange) {
        case "binance": {
          if (row.api_key_enc === null || row.api_secret_enc === null) {
            throw new Error("Stored connection has no key pair");
          }
          sources.push(
            binancePortfolio(
              decryptSecret(row.api_key_enc, "api_key"),
              decryptSecret(row.api_secret_enc, "api_secret"),
            ),
          );
          break;
        }
        case "hyperliquid": {
          if (row.wallet_address === null) {
            throw new Error("Stored connection has no wallet address");
          }
          sources.push(hyperliquidPortfolio(row.wallet_address));
          break;
        }
        case "okx": {
          /* The schema carries the columns, including the passphrase OKX
             signs with, but no private client is implemented in this pass.
             OKX is public market data only. */
          failures.push({
            scope: "okx",
            reason: "OKX portfolio reads are not implemented yet",
          });
          break;
        }
      }
    } catch (error) {
      failures.push({
        scope: row.exchange,
        reason: error instanceof Error ? error.message : "Unreadable credential",
      });
    }
  }

  const hasHyperliquid = sources.some((source) => source.id === "hyperliquid");
  if (!hasHyperliquid && sessionWallet !== null) {
    sources.push(hyperliquidPortfolio(sessionWallet));
  }

  return { sources, failures };
}
