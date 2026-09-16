import { NextResponse } from "next/server";
import { getSessionUser, hasProfile, profileUnavailable } from "@/lib/auth/session";
import { encryptSecret, lastFour } from "@/lib/crypto/credentials";
import { listConnections } from "@/lib/exchange/accounts";
import { serviceClient } from "@/lib/supabase/server";
import type { ExchangeId } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Connecting an exchange.

   Keys arrive here once, are encrypted immediately, and are never returned.
   GET reports which venues are connected and the last four characters of the
   API key — enough to recognise a connection, useless as a credential.

   These are READ-ONLY connections. Nothing in this codebase calls a trading
   endpoint, but a key with trade permission would still be a key with trade
   permission sitting in a database. The UI says so; this is the note for
   whoever reads the code.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";

const SUPPORTED: ExchangeId[] = ["binance", "hyperliquid"];

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /* Half of this answer does not come from the database. `sessionWallet` is
     the Privy EVM address, and it is already a readable Hyperliquid account
     — the panel uses it to offer a portfolio read with nothing connected at
     all. Refusing the whole request would withdraw a working feature over a
     stored list that happens to sit beside it, so the stored half is reported
     as empty-and-unknown and the rest is answered. */
  if (!hasProfile(user)) {
    return NextResponse.json({
      connections: [],
      sessionWallet: user.walletAddress,
      supported: SUPPORTED,
      unavailable:
        "Saved connections could not be read: the database is unreachable. " +
        "Your session wallet still works.",
    });
  }

  return NextResponse.json({
    connections: await listConnections(user.userId),
    /* The EVM address, which is already a readable Hyperliquid account — so
       the UI can say so rather than asking the user to connect one. Null on a
       Solana-only account, and the panel then says nothing about Hyperliquid
       rather than showing a Solana address it cannot read. */
    sessionWallet: user.walletAddress,
    supported: SUPPORTED,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!hasProfile(user)) return profileUnavailable("Saving an exchange connection");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const exchange = String(body.exchange ?? "") as ExchangeId;
  if (!SUPPORTED.includes(exchange)) {
    return NextResponse.json(
      { error: `Supported exchanges: ${SUPPORTED.join(", ")}` },
      { status: 400 },
    );
  }

  const db = serviceClient();

  if (exchange === "hyperliquid") {
    const address = String(body.walletAddress ?? "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Expected an EVM wallet address." },
        { status: 400 },
      );
    }

    const { error } = await db.from("exchange_accounts").upsert(
      {
        user_id: user.userId,
        exchange,
        wallet_address: address.toLowerCase(),
        label: typeof body.label === "string" ? body.label : null,
      },
      { onConflict: "user_id,exchange" },
    );

    if (error) {
      console.error("[exchanges]", error);
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const apiKey = String(body.apiKey ?? "").trim();
  const apiSecret = String(body.apiSecret ?? "").trim();

  if (apiKey.length === 0 || apiSecret.length === 0) {
    return NextResponse.json(
      { error: "Both an API key and secret are required." },
      { status: 400 },
    );
  }

  const { error } = await db.from("exchange_accounts").upsert(
    {
      user_id: user.userId,
      exchange,
      api_key_enc: encryptSecret(apiKey, "api_key"),
      api_secret_enc: encryptSecret(apiSecret, "api_secret"),
      key_last_four: lastFour(apiKey),
      label: typeof body.label === "string" ? body.label : null,
    },
    { onConflict: "user_id,exchange" },
  );

  if (error) {
    console.error("[exchanges]", error);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!hasProfile(user)) return profileUnavailable("Removing an exchange connection");

  const requested = new URL(request.url).searchParams.get("exchange");
  /* Checked against the known set rather than passed through: the value goes
     into a query, and a column with a check constraint should not be handed
     an arbitrary string from a URL. */
  const exchange = (["binance", "okx", "hyperliquid"] as const).find(
    (entry) => entry === requested,
  );
  if (exchange === undefined) {
    return NextResponse.json({ error: "Name an exchange." }, { status: 400 });
  }

  /* Scoped to the caller: without the user_id filter this would delete any
     user's connection by name. */
  const { error } = await serviceClient()
    .from("exchange_accounts")
    .delete()
    .eq("user_id", user.userId)
    .eq("exchange", exchange);

  if (error) {
    console.error("[exchanges]", error);
    return NextResponse.json({ error: "Could not remove." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
