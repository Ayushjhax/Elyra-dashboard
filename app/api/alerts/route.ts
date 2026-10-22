import { NextResponse } from "next/server";
import {
  databaseUnavailableMessage,
  getSessionUser,
  hasProfile,
} from "@/lib/auth/session";
import { serviceClient } from "@/lib/supabase/server";
import { createAlert, deleteAlert, listAlerts, type PriceAlert } from "@/lib/alerts/store";
import { appDeliveryFor } from "@/lib/alerts/rules";
import type { AlertsResponse } from "@/lib/alerts/types";
import { notificationPreferences } from "@/lib/notifications/preferences";

/* ---------------------------------------------------------------------------
   Price alerts, from the web.

   The same alerts `/alert SOL > 120` sets on Telegram — one table, one
   delivery worker (lib/telegram/deliver.ts) that checks every armed alert
   against live prices and messages the linked chat when one crosses. This
   route only lets the chart set and clear them; it delivers nothing itself,
   which is why it reports whether Telegram is linked: an alert with nowhere
   to go should say so when it is set, not stay silent when it fires.

   The user is the verified session's, never the body's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The response type is shared with the website and the app. */
export type { AlertsResponse } from "@/lib/alerts/types";

const SYMBOL = /^[A-Z0-9]{1,12}$/;

async function session(
  request: Request,
): Promise<{ response: Response } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) {
    return {
      response: NextResponse.json(
        { alerts: [], delivery: null, appDelivery: "none", error: databaseUnavailableMessage("Alerts") },
        { status: 503 },
      ),
    };
  }
  return { userId: user.userId };
}

async function telegramLinked(userId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("telegram_links")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null && data !== undefined;
}

/** The app's devices for this account: whether it has the app, and whether any can take a push. */
async function appDevices(userId: string): Promise<{ hasApp: boolean; canPush: boolean }> {
  const { data } = await serviceClient().from("push_devices").select("disabled_at").eq("user_id", userId);
  const rows = data ?? [];
  return { hasApp: rows.length > 0, canPush: rows.some((row) => row.disabled_at === null) };
}

export async function GET(request: Request): Promise<Response> {
  const resolved = await session(request);
  if ("response" in resolved) return resolved.response;

  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? null;
  const [alerts, linked, app, preferences] = await Promise.all([
    listAlerts(resolved.userId),
    telegramLinked(resolved.userId),
    appDevices(resolved.userId),
    notificationPreferences(resolved.userId),
  ]);
  const on = preferences.priceAlerts;
  return NextResponse.json<AlertsResponse>({
    alerts: symbol === null ? alerts : alerts.filter((alert) => alert.symbol === symbol),
    delivery:
      linked && on ? "telegram"
      : app.canPush && on ? "app"
      : app.hasApp ? "inbox"
      : linked ? "muted"
      : null,
    appDelivery: appDeliveryFor({ priceAlertsOn: on, hasApp: app.hasApp, canPush: app.canPush }),
    error: null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await session(request);
  if ("response" in resolved) return resolved.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const direction = body.direction === "above" || body.direction === "below" ? body.direction : null;
  const target = typeof body.target === "number" ? body.target : Number.NaN;
  const currentPrice = typeof body.currentPrice === "number" ? body.currentPrice : null;

  if (!SYMBOL.test(symbol) || direction === null || !Number.isFinite(target) || target <= 0) {
    return NextResponse.json(
      { error: "An alert needs a symbol, a direction (above or below) and a positive price." },
      { status: 400 },
    );
  }

  const created = await createAlert({
    userId: resolved.userId,
    symbol,
    direction,
    target,
    currentPrice,
  });
  if (!created) {
    return NextResponse.json({ error: "The alert could not be saved." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const resolved = await session(request);
  if ("response" in resolved) return resolved.response;

  const id = new URL(request.url).searchParams.get("id");
  if (id === null || id.length === 0) {
    return NextResponse.json({ error: "Which alert? Pass ?id=." }, { status: 400 });
  }
  const removed = await deleteAlert(resolved.userId, id);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
