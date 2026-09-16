import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  isPredictionAddress,
  linkPredictionAccount,
  predictionAccount,
  unlinkPredictionAccount,
} from "@/lib/prediction/account";
import { exposureOf } from "@/lib/prediction/analytics";
import { candidatesFor } from "@/lib/prediction/derive";
import {
  polymarketActivity,
  polymarketPositions,
} from "@/lib/providers/polymarket-account";

/* ---------------------------------------------------------------------------
   Linking a prediction-market account.

   ── Why the address is supplied rather than derived ────────────────────

   Polymarket holds positions in a contract wallet, not the EOA that controls
   it. The current generation of those (deposit wallets, mid-2026 onward) IS
   deterministically derivable via CREATE2 from a documented factory and
   beacon — but the legacy Proxy wallets created through email login and the
   Safe wallets created through browser wallets are NOT, and between them
   they cover most existing accounts.

   A derivation that silently produces the wrong address does not fail
   loudly: it links a stranger's positions to this user's portfolio and
   reports them as theirs. Given that failure mode, asking is better than
   guessing.

   ── Verify before storing ──────────────────────────────────────────────

   POST with `preview: true` queries the live API and reports what is there
   without writing anything, so the operator confirms it is their account
   before it is attached to their portfolio. A typo then shows an empty
   preview instead of becoming a permanent wrong link.

   An address with no positions is still linkable — a new account legitimately
   has none — but it is stored UNVERIFIED so every surface can tell the two
   apart.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Found {
  address: string;
  positionCount: number;
  valueUsd: number;
  activityCount: number;
  /** A sample, so the operator can recognise the account at a glance. */
  sample: Array<{ market: string; outcome: string; valueUsd: number | null }>;
}

async function inspect(address: string): Promise<
  { ok: true; found: Found } | { ok: false; error: string; code: number }
> {
  const [positions, activity] = await Promise.all([
    polymarketPositions(address, { limit: 200 }),
    polymarketActivity(address, 5),
  ]);

  /* A provider outage must not look like an empty account — linking on the
     strength of a failed read is how someone attaches the wrong address and
     never finds out. */
  if (!positions.ok || positions.data === undefined) {
    return {
      ok: false,
      error:
        positions.error?.message ??
        "Could not reach the prediction-market provider to check that address.",
      code: 503,
    };
  }

  const exposure = exposureOf(positions.data);

  return {
    ok: true,
    found: {
      address,
      positionCount: positions.data.length,
      valueUsd: Math.round(exposure.currentValueUsd * 100) / 100,
      activityCount: activity.ok ? (activity.data?.length ?? 0) : 0,
      sample: positions.data.slice(0, 3).map((position) => ({
        market: position.marketTitle,
        outcome: position.outcome,
        valueUsd: position.currentValueUsd,
      })),
    },
  };
}

/**
 * Finds the caller's account without them typing anything.
 *
 * Derives the addresses a Polymarket account for this signer could live at,
 * checks each against live data, and returns the first that actually holds
 * positions. An address with nothing at it is NOT auto-linked — a wrong guess
 * that stores silently would attach a stranger's positions to this portfolio.
 */
async function detect(signer: string | null): Promise<
  | { found: Found; kind: string }
  | { found: null; checked: number; reason: string }
> {
  if (signer === null || signer.length === 0) {
    return {
      found: null,
      checked: 0,
      reason: "No wallet is connected to this account.",
    };
  }

  const candidates = candidatesFor(signer);

  for (const candidate of candidates) {
    const inspection = await inspect(candidate.address);
    /* A provider outage is not "not found" — stop rather than report a
       confident negative built on a failed read. */
    if (!inspection.ok) {
      return { found: null, checked: candidates.length, reason: inspection.error };
    }
    if (inspection.found.positionCount > 0 || inspection.found.activityCount > 0) {
      return { found: inspection.found, kind: candidate.kind };
    }
  }

  return {
    found: null,
    checked: candidates.length,
    reason:
      "No prediction-market account was found for your connected wallet. If " +
      "you trade on Polymarket with a different login, enter that address below.",
  };
}

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const account = await predictionAccount(user.userId);

  return NextResponse.json(
    {
      connected: account !== null,
      address: account?.address ?? null,
      verifiedAt: account?.verifiedAt ?? null,
      /* Offered as a starting point, not assumed to be correct. Some people
         do trade from the EOA directly; most do not. */
      suggestion: user.walletAddress ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { address?: unknown; preview?: unknown; detect?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  /* ---- Automatic detection ----

     No address supplied: work it out from the connected wallet. Still goes
     through the same verification, and still only links something that was
     actually found. */
  if (body.detect === true) {
    const outcome = await detect(user.walletAddress);

    if (outcome.found === null) {
      return NextResponse.json(
        { detected: false, reason: outcome.reason },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    const linked = await linkPredictionAccount(user.userId, outcome.found.address, true);
    if (!linked) {
      return NextResponse.json(
        { error: "Could not save that. Nothing was changed." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { detected: true, connected: true, verified: true, found: outcome.found },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (!isPredictionAddress(address)) {
    return NextResponse.json(
      { error: "That is not a wallet address. It should start 0x and be 42 characters." },
      { status: 400 },
    );
  }

  const inspection = await inspect(address);
  if (!inspection.ok) {
    return NextResponse.json({ error: inspection.error }, { status: inspection.code });
  }

  /* Look, do not touch. The operator sees what is there and decides. */
  if (body.preview === true) {
    return NextResponse.json(
      { preview: true, found: inspection.found },
      { headers: { "cache-control": "no-store" } },
    );
  }

  /* Verified means the address demonstrably belongs to a real Polymarket
     account. A new account with nothing in it is still linkable, just not
     verified — and the difference is worth keeping, because it is the
     difference between "you have no positions" and "this might be a typo". */
  const verified =
    inspection.found.positionCount > 0 || inspection.found.activityCount > 0;

  const saved = await linkPredictionAccount(user.userId, address, verified);
  if (!saved) {
    return NextResponse.json(
      { error: "Could not save that. Nothing was changed." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { connected: true, verified, found: inspection.found },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const removed = await unlinkPredictionAccount(user.userId);
  if (!removed) {
    return NextResponse.json({ error: "Could not unlink." }, { status: 503 });
  }

  return NextResponse.json({ connected: false });
}
