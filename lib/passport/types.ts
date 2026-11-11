/* ---------------------------------------------------------------------------
   The Asset Passport — what a token is, who stands behind it, and what its
   mint lets someone do to it, with where each fact came from.

   Pure, and listed in lib/core.ts: the website renders it today, and the app
   can render the same contract later.

   Every fact carries its own verification, because the passport's whole job
   is to say how much is known:

     on-chain      read from the Solana mint account itself — authoritative
                   for what the token CAN do, silent on what it means
     elyra-list    Elyra's hand-verified mint list (lib/trade.ts), matched by
                   address, never by name
     jupiter       Jupiter's token index — a listing, not proof
     not-verified  a question with an answer somewhere (the issuer's terms)
                   that Elyra has not read or verified
     unknown       no source Elyra has answers it
--------------------------------------------------------------------------- */

export type Verification = "on-chain" | "elyra-list" | "jupiter" | "not-verified" | "unknown";

export type SourceId = "chain" | "jupiter" | "elyra" | "issuer" | "metadata";

export interface PassportSource {
  id: SourceId;
  label: string;
  /** A link to the source itself, when there is a stable one. Never a page Elyra scraped. */
  url: string | null;
  /** When the source last changed or was read, ISO. Null when it does not record one. */
  asOf: string | null;
  /** Why a source has no data, when it was asked and could not answer. */
  unavailable: string | null;
}

export interface PassportFact {
  label: string;
  /** Null when the value is not known; `note` then says why. */
  value: string | null;
  verification: Verification;
  source: SourceId | null;
  note: string | null;
  /** A link that supports the value — the explorer, the issuer's documentation. */
  url: string | null;
}

/** Something the mint lets an address do, or a property it fixes. Always read on-chain. */
export interface PassportControl {
  id: string;
  title: string;
  /** What it means for a holder, in plain language. */
  detail: string;
  /** The address that holds the power, when one does. */
  authority: string | null;
  /** True when it can affect holders now (an authority exists, or a state is on). */
  live: boolean;
}

export interface AssetPassport {
  mint: string;
  network: "solana-mainnet";
  symbol: string | null;
  name: string | null;
  icon: string | null;
  identity: PassportFact[];
  represents: PassportFact;
  issuer: PassportFact;
  /** Rights, redemption, maturity, eligibility, legal restrictions — never filled from metadata. */
  terms: PassportFact[];
  controls: PassportControl[];
  /** Context written for the facts shown, not boilerplate. */
  context: string[];
  sources: PassportSource[];
  /** When this passport was assembled, ISO. */
  readAt: string;
}

export interface PassportResponse {
  passport: AssetPassport | null;
  /** Why there is no passport, in words. */
  error: string | null;
}
