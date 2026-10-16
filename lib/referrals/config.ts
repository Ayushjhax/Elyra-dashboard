/* ---------------------------------------------------------------------------
   The referral programme's rules, in one place.

   Every constant the programme depends on lives here and nowhere else. A
   reward amount duplicated into a component is a number that will disagree
   with the ledger the first time someone tunes it, and the disagreement will
   be invisible until a user notices they were paid less than the page
   promised.

   ── A business rule this repository did not have ───────────────────────

   The spec is explicit that activation must come from real product rules and
   must not be silently invented. There are none: the audit found no
   onboarding flow, no verification step, no "activated" flag, no points
   system and no milestone of any kind anywhere in this codebase.

   So ACTIVATION_RULE below is a DOCUMENTED PLACEHOLDER, centralised behind
   one server-side evaluator (lib/referrals/activation.ts) so that replacing
   it is a one-line change here rather than an audit of the UI.

   The default is `wallet_funded` rather than `wallet_connected` for one
   reason: a referral programme pays out, and "connected a wallet" costs an
   attacker nothing. Requiring the referred account to actually hold value
   makes farming cost real money, which is the cheapest abuse control
   available without device fingerprinting — something the spec says not to
   add without a legal requirement.

   The rule and every amount are fixed in `REFERRAL_PROGRAMME` below; a
   different programme is a change to that one object.
--------------------------------------------------------------------------- */

/**
 * What a referred account must do before their referrer is paid.
 *
 * - `profile_created` — signing in once. Weakest; free to farm.
 * - `wallet_connected` — a Solana address is linked to the account.
 * - `wallet_funded`    — the account holds at least
 *   `activationMinValueUsd` of tracked, verified value. The programme's rule.
 */
export type ActivationRule = "profile_created" | "wallet_connected" | "wallet_funded";

export interface ReferralConfig {
  /** Points the referrer earns for each activated referral. */
  activationPoints: number;
  /** Activated referrals that fill one pool. */
  activationPoolTarget: number;
  /** Points awarded each time a pool completes. Pools repeat. */
  poolCompletionBonusPoints: number;
  /** What counts as activated. See the note above. */
  activationRule: ActivationRule;
  /** Tracked USD a referred account must hold under `wallet_funded`. */
  activationMinValueUsd: number;
}

/**
 * The programme, as published on the Referrals page and paid by the ledger.
 *
 * Fixed in code rather than read from the environment. These are promises
 * made to people — "100 points when they activate", "+500 every five" — and
 * a deployment variable that quietly changed one would change what is paid
 * without changing what was promised to anyone already sharing a link.
 * Changing the programme is a code change, reviewed, with the page and the
 * ledger moving together.
 */
export const REFERRAL_PROGRAMME: Readonly<ReferralConfig> = Object.freeze({
  activationPoints: 100,
  activationPoolTarget: 5,
  poolCompletionBonusPoints: 500,
  activationRule: "wallet_funded",
  activationMinValueUsd: 10,
});

export function referralConfig(): ReferralConfig {
  return { ...REFERRAL_PROGRAMME };
}

/* ---------------------------------------------------------------------------
   Referral links
--------------------------------------------------------------------------- */

/**
 * Where a referral link points.
 *
 * `APP_URL` is not used: it is a development tunnel in this repository, and a
 * referral link is a durable artifact someone pastes into a group chat. A
 * link that stops working when the tunnel rotates is worse than one that
 * points at production from the start.
 */
export function referralBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REFERRAL_BASE_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }
  return "https://getelyra.xyz";
}

export function referralUrlFor(code: string): string {
  return `${referralBaseUrl()}/r/${code}`;
}

/* ---------------------------------------------------------------------------
   Referral codes

   Crockford-ish alphabet: no 0/O, no 1/I/L. Those four are the pairs people
   get wrong reading a code off a screen and typing it into a phone, and a
   referral code's whole job is to survive being retyped.
--------------------------------------------------------------------------- */

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 7;

/** Whether a string could be a code at all, before touching the database. */
export function isWellFormedCode(value: string): boolean {
  if (value.length < 6 || value.length > 10) return false;
  return [...value.toUpperCase()].every((character) => CODE_ALPHABET.includes(character));
}

/** The cookie carrying an attribution between the click and the sign-up. */
export const ATTRIBUTION_COOKIE = "elyra_ref";

/** How long an attribution survives. Long enough to sleep on the decision. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
