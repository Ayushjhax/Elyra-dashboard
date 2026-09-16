import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type DefiPosition,
  type DefiPositionKind,
  type DefiTokenLeg,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Kamino — lending, leverage and vault positions on Solana.

   Keyless and public. The schema below was not guessed: it is taken from the
   OpenAPI document Kamino publishes at

     https://api.kamino.finance/openapi/json?openapi=3.0.0

   and checked against a live call to `/portfolio/{pubkey}` while writing
   this. Both matter — the spec names the fields, the live call proves the
   sections behave as documented for a wallet with only some products used.

   ── Two things this adapter exists to get right ────────────────────────

   1. `indexed: false` is a product the wallet does not use.

      It reads like "nobody looked", and it was treated that way here until a
      live check proved otherwise: Kamino sets `indexed: true` on exactly the
      sections a wallet holds positions in. An active borrower returns
      `lending` and `multiply` indexed with rows and the other five unindexed
      and empty; a wallet with no Kamino history returns all seven unindexed.

      A genuine failure arrives in a section's `errors` instead, which is what
      `partial: true` is reserved for. Warning on `indexed: false` marked every
      portfolio partial unless the user held all seven products at once.

   2. Every number arrives as a decimal STRING.

      `"0.4673503786241097951"` does not survive `JSON.parse` as a number in
      a form anyone should rely on, and Kamino sends LTVs, amounts and prices
      this way deliberately. They are parsed in one place, below, and an
      unparseable value becomes null rather than NaN or zero.

   The liquidation threshold is reported per obligation. That is the reason
   this provider is worth having at all: `liquidationLtv` is a fact here, so
   `liquidationHeadroom` can answer honestly instead of a caller inferring a
   distance from leverage.
--------------------------------------------------------------------------- */

const BASE = "https://api.kamino.finance";

/** Positions are indexed on a cadence measured in minutes, not seconds. */
const PORTFOLIO_TTL_MS = 60_000;

export const kaminoProvider: ProviderAdapter = {
  id: "kamino",
  capabilities: ["defi_positions"] as const satisfies readonly DataCapability[],
  /* Public and keyless — the flag is the only thing that can switch it off. */
  configured: () => process.env.ENABLE_KAMINO !== "false",
};

/* ---------------------------------------------------------------------------
   The wire shape, exactly as the OpenAPI document describes it
--------------------------------------------------------------------------- */

interface WireLeg {
  mint: string;
  symbol?: string | null;
  amount?: string | null;
  value?: string | null;
  price?: string | null;
}

interface WireObligation {
  obligation: string;
  market?: string;
  tag?: string;
  netValue?: string | null;
  totalDepositValue?: string | null;
  totalBorrowValue?: string | null;
  ltv?: string | null;
  liquidationLtv?: string | null;
  leverage?: string | null;
  deposits?: WireLeg[];
  borrows?: WireLeg[];
}

interface WireLiquidity {
  strategy: string;
  /** The receipt token the wallet actually holds for this position. */
  shareMint?: string | null;
  netValue?: string | null;
  tokenA?: WireLeg | null;
  tokenB?: WireLeg | null;
}

interface WireEarn {
  vault: string;
  tokenMint: string;
  symbol?: string | null;
  name?: string | null;
  netValue?: string | null;
  amount?: string | null;
}

interface WireStaking {
  mint: string;
  symbol?: string | null;
  farm?: string;
  amount?: string | null;
  value?: string | null;
  price?: string | null;
}

interface WireSection {
  indexed?: boolean;
  positionsRefreshedOn?: string | null;
  pricesRefreshedOn?: string | null;
  errors?: unknown[];
}

interface WirePortfolio {
  timestamp?: string;
  sections?: Record<string, WireSection>;
  lending?: WireObligation[];
  multiply?: WireObligation[];
  leverage?: WireObligation[];
  liquidity?: WireLiquidity[];
  earn?: WireEarn[];
  privateCredit?: WireEarn[];
  staking?: WireStaking[];
}

/* ---------------------------------------------------------------------------
   Parsing
--------------------------------------------------------------------------- */

/**
 * A Kamino decimal string as a number, or null.
 *
 * Null rather than 0 for anything unparseable. The difference is the whole
 * point of the envelope: a borrow of unknown size is not a borrow of nothing.
 */
function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function leg(wire: WireLeg): DefiTokenLeg {
  return {
    mint: wire.mint,
    symbol: wire.symbol ?? null,
    amount: num(wire.amount),
    usdValue: num(wire.value),
    usdPrice: num(wire.price),
  };
}

function obligationToPosition(
  wire: WireObligation,
  kind: DefiPositionKind,
): DefiPosition {
  const supplied = (wire.deposits ?? []).map(leg);
  const borrowed = (wire.borrows ?? []).map(leg);

  /* The label names what the operator would recognise: the collateral and
     what is borrowed against it, not the obligation pubkey. */
  const collateral = supplied.map((item) => item.symbol ?? "?").join("+");
  const debt = borrowed.map((item) => item.symbol ?? "?").join("+");
  const label =
    borrowed.length === 0
      ? `Kamino ${kind} · ${collateral || "—"}`
      : `Kamino ${kind} · ${collateral || "—"} / ${debt}`;

  return {
    id: wire.obligation,
    provider: "kamino",
    kind,
    label,
    netUsd: num(wire.netValue),
    suppliedUsd: num(wire.totalDepositValue),
    borrowedUsd: num(wire.totalBorrowValue),
    supplied,
    borrowed,
    /* Nothing borrowed is not an LTV of zero — it is a ratio with no
       denominator worth reporting, and a risk screen should show a dash. */
    ltv: borrowed.length === 0 ? null : num(wire.ltv),
    liquidationLtv: num(wire.liquidationLtv),
    leverage: num(wire.leverage),
    apy: null,
  };
}

function liquidityToPosition(wire: WireLiquidity): DefiPosition {
  const legs = [wire.tokenA, wire.tokenB]
    .filter((item): item is WireLeg => item !== null && item !== undefined)
    .map(leg);

  return {
    id: wire.strategy,
    provider: "kamino",
    shareMint: wire.shareMint ?? null,
    kind: "liquidity",
    label: `Kamino liquidity · ${legs.map((item) => item.symbol ?? "?").join("-")}`,
    netUsd: num(wire.netValue),
    suppliedUsd: num(wire.netValue),
    borrowedUsd: null,
    supplied: legs,
    borrowed: [],
    ltv: null,
    liquidationLtv: null,
    leverage: null,
    apy: null,
  };
}

function earnToPosition(wire: WireEarn, kind: DefiPositionKind): DefiPosition {
  return {
    id: wire.vault,
    provider: "kamino",
    kind,
    label: wire.name ?? `Kamino ${kind} · ${wire.symbol ?? "vault"}`,
    netUsd: num(wire.netValue),
    suppliedUsd: num(wire.netValue),
    borrowedUsd: null,
    supplied: [
      {
        mint: wire.tokenMint,
        symbol: wire.symbol ?? null,
        amount: num(wire.amount),
        usdValue: num(wire.netValue),
        usdPrice: null,
      },
    ],
    borrowed: [],
    ltv: null,
    liquidationLtv: null,
    leverage: null,
    apy: null,
  };
}

function stakingToPosition(wire: WireStaking): DefiPosition {
  return {
    id: `${wire.farm ?? "farm"}:${wire.mint}`,
    provider: "kamino",
    kind: "staking",
    label: `Kamino staking · ${wire.symbol ?? wire.mint.slice(0, 4)}`,
    netUsd: num(wire.value),
    suppliedUsd: num(wire.value),
    borrowedUsd: null,
    supplied: [leg(wire)],
    borrowed: [],
    ltv: null,
    liquidationLtv: null,
    leverage: null,
    apy: null,
  };
}

/* ---------------------------------------------------------------------------
   The call
--------------------------------------------------------------------------- */

const SECTION_LABELS: Record<string, string> = {
  lending: "lending",
  multiply: "multiply",
  leverage: "leverage",
  liquidity: "liquidity",
  earn: "earn",
  privateCredit: "private credit",
  staking: "staking",
};

/**
 * Every Kamino position a wallet holds.
 *
 * Returns `partial: true` with a named warning for each section Kamino has
 * not indexed or reported an error for. A caller must treat that as "this
 * total is a floor", which is what `UnifiedPortfolio` does with it.
 */
export async function kaminoPositions(
  owner: string,
): Promise<ToolResult<DefiPosition[]>> {
  const address = owner.trim();
  if (address.length < 32 || address.length > 44) {
    return fail<DefiPosition[]>(
      "kamino",
      "INVALID_REQUEST",
      "That does not look like a Solana address.",
    );
  }

  return cached(`kamino:portfolio:${address}`, PORTFOLIO_TTL_MS, async () => {
    const response = await providerFetch<WirePortfolio>({
      provider: "kamino",
      url: `${BASE}/portfolio/${address}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<DefiPosition[]>(
        "kamino",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Kamino did not return a portfolio.",
      );
    }

    const wire = response.data;
    const positions: DefiPosition[] = [];

    for (const item of wire.lending ?? []) positions.push(obligationToPosition(item, "lending"));
    for (const item of wire.multiply ?? []) positions.push(obligationToPosition(item, "multiply"));
    for (const item of wire.leverage ?? []) positions.push(obligationToPosition(item, "leverage"));
    for (const item of wire.liquidity ?? []) positions.push(liquidityToPosition(item));
    for (const item of wire.earn ?? []) positions.push(earnToPosition(item, "earn"));
    for (const item of wire.privateCredit ?? []) {
      positions.push(earnToPosition(item, "private_credit"));
    }
    for (const item of wire.staking ?? []) positions.push(stakingToPosition(item));

    const rows: Record<string, number> = {
      lending: (wire.lending ?? []).length,
      multiply: (wire.multiply ?? []).length,
      leverage: (wire.leverage ?? []).length,
      liquidity: (wire.liquidity ?? []).length,
      earn: (wire.earn ?? []).length,
      privateCredit: (wire.privateCredit ?? []).length,
      staking: (wire.staking ?? []).length,
    };

    /* ---- What actually counts as a section this read missed ----

       `indexed: false` alone is NOT a failed read, despite how it sounds.
       Kamino marks a section indexed once the wallet has used that product:
       checked against a live borrower, `lending` and `multiply` came back
       `indexed: true` with rows while the five products that wallet has never
       touched came back `indexed: false`, no errors, no rows — and a wallet
       with no Kamino history returns `indexed: false` for all seven.

       So treating it as "we did not look" marks every portfolio partial
       forever unless the user happens to hold all seven products at once,
       which is the opposite of informative: a permanent warning is one nobody
       reads, and it hides the real ones below.

       Kamino reports a genuine failure in `errors`. That, and a section
       claiming to be unindexed while still returning rows, are the two cases
       where this read really is incomplete. */
    const warnings: string[] = [];
    for (const [key, section] of Object.entries(wire.sections ?? {})) {
      const label = SECTION_LABELS[key] ?? key;
      if ((section.errors ?? []).length > 0) {
        warnings.push(`Kamino reported an error reading ${label} positions.`);
        continue;
      }
      if (section.indexed === false && (rows[key] ?? 0) > 0) {
        warnings.push(`Kamino ${label} positions were not indexed for this wallet.`);
      }
    }

    return ok(positions, "kamino", {
      /* Kamino stamps when it read, which is older than when we asked. Using
         our own clock here would overstate how fresh the figures are. */
      asOf: wire.timestamp ?? new Date().toISOString(),
      partial: warnings.length > 0,
      warnings,
    });
  });
}
