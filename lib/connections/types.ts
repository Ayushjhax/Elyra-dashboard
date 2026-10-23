/* ---------------------------------------------------------------------------
   Exchange connections as /api/exchanges returns them — apart from
   lib/exchange/*, which reads venues and holds encrypted keys and is
   server-only, so the website and the Android app read one definition.

   No credential appears here: a stored key is described by its last four
   characters, and nothing the API returns can be used as a key.
--------------------------------------------------------------------------- */

export type ConnectedExchange = "binance" | "okx" | "hyperliquid";

/** A connected exchange, as the UI describes it. No secret material. */
export interface ConnectionSummary {
  exchange: ConnectedExchange;
  label: string | null;
  keyLastFour: string | null;
  walletAddress: string | null;
  connectedAt: string;
}

/** What is at an address, for a person to recognise before saving it. */
export interface HyperliquidAccountCheck {
  address: string;
  /** Perp account value: margin plus unrealised PnL. */
  accountValueUsd: number;
  positionCount: number;
  spotBalanceCount: number;
}

/** /api/exchanges (GET). */
export interface ExchangesResponse {
  connections: ConnectionSummary[];
  /** The session's EVM wallet — already a readable Hyperliquid account. */
  sessionWallet: string | null;
  supported: ConnectedExchange[];
  /** Saved connections could not be read; the session wallet still works. */
  unavailable?: string;
}

/** /api/exchanges (POST): a Hyperliquid preview or save, or a Binance key accepted. */
export interface ExchangeWriteResponse {
  ok?: boolean;
  preview?: boolean;
  found?: HyperliquidAccountCheck;
  /** Binance: whether the key is limited to trusted IPs. */
  ipRestricted?: boolean;
  error?: string;
  reason?: string;
}
