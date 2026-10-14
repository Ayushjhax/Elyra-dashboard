/* ---------------------------------------------------------------------------
   What a wallet transaction did, in a line.

   Read from the transaction's NET effect on this wallet — the balance
   changes Helius reports per account — not from its individual transfers.
   A Jupiter swap routes through several pools and wraps and unwraps SOL on
   the way; added up transfer by transfer it looks like six movements, and
   netted against the wallet it is what it was: one asset out, one in.

   The fee is added back when this wallet paid it, so "Sent 1 SOL" means one
   SOL left for the recipient, and the fee is shown on its own.

   A token Jupiter's verified index does not know is named as unverified and
   never by the symbol its own metadata claims — airdropping a mint called
   "USDC" costs cents, and a feed that repeated the name would be lying for
   the attacker.

   Client-safe and pure; the Helius read lives in lib/wallet/helius.ts.
--------------------------------------------------------------------------- */

export type TxKind = "receive" | "send" | "swap" | "stake" | "unstake" | "nft" | "account" | "other";

export interface TxAmount {
  /** "SOL", a verified symbol, or null for an unverified token. */
  symbol: string | null;
  mint: string | null;
  /** Signed: positive came in, negative went out. */
  amount: number;
  icon: string | null;
}

export interface TxSummary {
  kind: TxKind;
  /** "Swapped 2 SOL for 290.41 USDC". Written for a person. */
  title: string;
  amounts: TxAmount[];
  /** The other side of a send or receive. */
  counterparty: string | null;
  /** "Jupiter", "System program". Null when Helius could not name it. */
  via: string | null;
  /** SOL this wallet paid in fees. Null when someone else paid. */
  feeSol: number | null;
  /** Only unverified tokens arrived: almost always an airdrop to ignore. */
  unverifiedOnly: boolean;
}

/** The slice of a Helius enhanced transaction this reads. */
export interface HeliusTransaction {
  signature: string;
  type?: string;
  source?: string;
  fee?: number;
  feePayer?: string;
  description?: string;
  nativeTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; amount?: number }>;
  tokenTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; mint?: string; tokenAmount?: number }>;
  accountData?: Array<{
    account?: string;
    nativeBalanceChange?: number;
    tokenBalanceChanges?: Array<{
      userAccount?: string;
      mint?: string;
      rawTokenAmount?: { tokenAmount?: string; decimals?: number };
    }>;
  }>;
}

export interface TokenLabel {
  symbol: string;
  icon: string | null;
}

const LAMPORTS = 1_000_000_000;
const WSOL = "So11111111111111111111111111111111111111112";
/** Below this a SOL change is rent dust or rounding, not a movement. */
const SOL_DUST = 0.00001;

const VIA: Record<string, string> = {
  JUPITER: "Jupiter",
  RAYDIUM: "Raydium",
  ORCA: "Orca",
  METEORA: "Meteora",
  PUMP_FUN: "Pump.fun",
  PHANTOM: "Phantom",
  MAGIC_EDEN: "Magic Eden",
  TENSOR: "Tensor",
  MARINADE: "Marinade",
  JITO: "Jito",
  SYSTEM_PROGRAM: "System program",
  SOLANA_PROGRAM_LIBRARY: "Token program",
  STAKE_PROGRAM: "Stake program",
};

function viaFor(source: string | undefined): string | null {
  if (!source || source === "UNKNOWN") return null;
  return VIA[source] ?? source.charAt(0) + source.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "1.25", "1,204.5", "1.71M", "0.000042". */
export function formatAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 2)}M`;
  if (abs >= 10_000) return abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return abs.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (abs === 0) return "0";
  return abs.toPrecision(3).replace(/\.?0+$/, "");
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** An unverified token is named by its mint, never by the symbol it claims. */
export function assetName(entry: Pick<TxAmount, "symbol" | "mint">): string {
  return entry.symbol ?? (entry.mint ? shortAddress(entry.mint) : "unverified token");
}

function label(entry: TxAmount): string {
  return `${formatAmount(entry.amount)} ${assetName(entry)}`;
}

/**
 * The summary of one transaction for one wallet. Null when the transaction
 * does not touch the wallet's balances and Helius gave no type to name it by.
 */
export function summarise(
  tx: HeliusTransaction,
  wallet: string,
  tokens: ReadonlyMap<string, TokenLabel>,
): TxSummary | null {
  const paidFee = tx.feePayer === wallet && typeof tx.fee === "number";
  const feeSol = paidFee ? (tx.fee as number) / LAMPORTS : null;

  /* ---- Net effect on this wallet ---- */
  const nativeLamports = (tx.accountData ?? [])
    .filter((entry) => entry.account === wallet)
    .reduce((sum, entry) => sum + (entry.nativeBalanceChange ?? 0), 0);
  let sol = (nativeLamports + (paidFee ? (tx.fee as number) : 0)) / LAMPORTS;

  const byMint = new Map<string, number>();
  for (const entry of tx.accountData ?? []) {
    for (const change of entry.tokenBalanceChanges ?? []) {
      if (change.userAccount !== wallet || !change.mint) continue;
      const raw = Number(change.rawTokenAmount?.tokenAmount ?? 0);
      const decimals = change.rawTokenAmount?.decimals ?? 0;
      if (!Number.isFinite(raw) || raw === 0) continue;
      byMint.set(change.mint, (byMint.get(change.mint) ?? 0) + raw / 10 ** decimals);
    }
  }
  /* Wrapped SOL is SOL. */
  const wrapped = byMint.get(WSOL);
  if (wrapped !== undefined) {
    sol += wrapped;
    byMint.delete(WSOL);
  }

  const amounts: TxAmount[] = [];
  if (Math.abs(sol) >= SOL_DUST) amounts.push({ symbol: "SOL", mint: null, amount: sol, icon: null });
  for (const [mint, amount] of byMint) {
    if (amount === 0) continue;
    const known = tokens.get(mint);
    amounts.push({ symbol: known?.symbol ?? null, mint, amount, icon: known?.icon ?? null });
  }

  const ins = amounts.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
  const outs = amounts.filter((entry) => entry.amount < 0).sort((a, b) => a.amount - b.amount);
  const via = viaFor(tx.source);
  const type = tx.type ?? "UNKNOWN";

  /* ---- Who was on the other side ---- */
  const transfers = [
    ...(tx.nativeTransfers ?? []).filter((entry) => (entry.amount ?? 0) / LAMPORTS >= SOL_DUST),
    ...(tx.tokenTransfers ?? []),
  ];
  const from = transfers.find((entry) => entry.toUserAccount === wallet && entry.fromUserAccount && entry.fromUserAccount !== wallet)?.fromUserAccount;
  const to = transfers.find((entry) => entry.fromUserAccount === wallet && entry.toUserAccount && entry.toUserAccount !== wallet)?.toUserAccount;

  const unverifiedOnly = ins.length > 0 && outs.length === 0 && ins.every((entry) => entry.symbol === null);
  const more = (list: TxAmount[]) => (list.length > 1 ? ` +${list.length - 1} more` : "");

  let kind: TxKind;
  let title: string;
  let counterparty: string | null = null;

  if (type === "STAKE_SOL" || type === "STAKE_TOKEN") {
    kind = "stake";
    title = outs[0] ? `Staked ${label({ ...outs[0], amount: -outs[0].amount })}` : "Staked";
  } else if (type === "UNSTAKE_SOL" || type === "UNSTAKE_TOKEN" || type === "WITHDRAW") {
    kind = "unstake";
    title = ins[0] ? `Withdrew ${label(ins[0])}` : "Withdrew stake";
  } else if (type.startsWith("NFT_") || type === "COMPRESSED_NFT_MINT") {
    kind = "nft";
    title = type === "NFT_MINT" || type === "COMPRESSED_NFT_MINT" ? "Minted an NFT" : type === "NFT_SALE" ? (ins.length > 0 ? "Sold an NFT" : "Bought an NFT") : "NFT activity";
  } else if (ins.length > 0 && outs.length > 0) {
    kind = "swap";
    title = `Swapped ${label({ ...outs[0], amount: -outs[0].amount })}${more(outs)} for ${label(ins[0])}${more(ins)}`;
  } else if (ins.length > 0) {
    kind = "receive";
    counterparty = from ?? null;
    title = unverifiedOnly ? "Received an unverified token" : `Received ${label(ins[0])}${more(ins)}`;
  } else if (outs.length > 0) {
    kind = "send";
    counterparty = to ?? null;
    title = `Sent ${label({ ...outs[0], amount: -outs[0].amount })}${more(outs)}${counterparty ? ` to ${shortAddress(counterparty)}` : ""}`;
  } else if (type === "CLOSE_ACCOUNT" || type === "CREATE_ACCOUNT" || type === "INIT_ACCOUNT") {
    kind = "account";
    title = type === "CLOSE_ACCOUNT" ? "Closed a token account" : "Opened a token account";
  } else if (type !== "UNKNOWN") {
    kind = "other";
    title = type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ");
  } else {
    kind = "other";
    title = via ? `Interacted with ${via}` : "Program interaction";
  }

  return { kind, title, amounts, counterparty, via, feeSol, unverifiedOnly };
}
