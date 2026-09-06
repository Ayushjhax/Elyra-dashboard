/* ---------------------------------------------------------------------------
   Token accounts to balances.

   Pure, and separate from the route, because the rule it encodes is the one
   most easily got wrong: **one owner can hold several accounts for the same
   mint**. There is the associated token account, and there can be any number
   of auxiliary ones created by programs, airdrops or older wallets. Reading
   the first and calling it the balance understates the holding by whatever
   sits in the rest, and it does so silently — the number looks perfectly
   plausible.

   Structurally typed rather than importing the RPC module's interface, so
   this file stays free of `server-only` and can be tested directly.
--------------------------------------------------------------------------- */

export interface RawTokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: {
            amount?: string;
            decimals?: number;
            uiAmount?: number | null;
          };
        };
      };
    };
  };
}

export interface HeldToken {
  amount: number;
  decimals: number;
}

export function foldAccounts(
  accounts: readonly RawTokenAccount[],
): Map<string, HeldToken> {
  const byMint = new Map<string, HeldToken>();

  for (const entry of accounts) {
    const info = entry.account?.data?.parsed?.info;
    const mint = info?.mint;
    const tokenAmount = info?.tokenAmount;
    if (typeof mint !== "string" || tokenAmount === undefined) continue;

    const decimals = tokenAmount.decimals;
    if (typeof decimals !== "number") continue;

    /* `uiAmount` is pre-scaled but documented as nullable, so the raw string
       and the decimals are the reliable pair. Number() on a u64 past 2^53
       loses precision, which is acceptable for a displayed balance and would
       not be for anything that moved funds — nothing here does. */
    const amount =
      tokenAmount.uiAmount ??
      (tokenAmount.amount === undefined
        ? Number.NaN
        : Number(tokenAmount.amount) / 10 ** decimals);

    /* Zero-balance accounts are left behind by every closed position and
       every swept airdrop. They are not holdings and would bury the real
       ones. Non-finite means the account was malformed. */
    if (!Number.isFinite(amount) || amount === 0) continue;

    const existing = byMint.get(mint);
    if (existing === undefined) byMint.set(mint, { amount, decimals });
    else existing.amount += amount;
  }

  return byMint;
}
