import "server-only";
import { formatPriceUsd } from "@/lib/format";
import { pricesForSymbols } from "@/lib/market/pyth/client";

import {
  armedAlerts,
  hasCrossed,
  markTriggered,
} from "@/lib/alerts/store";
import { flags } from "@/lib/flags";
import { accountsWithApp, devicesFor } from "@/lib/notifications/devices";
import { addToInbox } from "@/lib/notifications/inbox";
import {
  claimNotification,
  notificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
import { checkReceipts, pushToDevices } from "@/lib/notifications/push";
import { escapeHtml } from "@/lib/personalized/render/telegram";
import { composePortfolio } from "@/lib/portfolio/compose";
import { moveInPoints } from "@/lib/prediction/analytics";
import { predictionAccount } from "@/lib/prediction/account";
import { binanceTicker } from "@/lib/providers/binance-public";
import { polymarketPositions } from "@/lib/providers/polymarket-account";
import { routeDefiPositions } from "@/lib/providers/router";
import { liquidationHeadroom } from "@/lib/providers/types";
import { serviceClient } from "@/lib/supabase/server";
import type { NotificationKind, PushDeviceRow } from "@/lib/supabase/types";
import { sendMessage } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Notification delivery — one pass, every channel.

   Called on a schedule (supabase/SCHEDULER.md). The pass decides WHAT
   happened — an alert crossed, a position entered a liquidation band, a
   market resolved — and claims each event exactly once. Only then does it
   decide WHERE the event goes, and sends it to every channel the person has:

     - Telegram, for a linked chat (the website's surface);
     - the inbox, for anyone who has the Android app;
     - push, to the app's enabled devices.

   One pass rather than one per channel, because the claim is the event: two
   passes would race for the same crossing, and whichever won would starve
   the other channel of it.

   Everything it sends is unsolicited, which sets the rules it works under:

   OPT-IN, CHECKED PER USER, EVERY TIME. Preferences are read for each
   recipient before anything is composed, and a failed read means send
   nothing. Linking a chat or installing the app is consent to ask questions;
   it is not consent to be told things. The one exception is an alert the
   person created themselves — a price alert or a prediction rule — which
   always lands in the app's inbox: setting it was the request. Push and
   Telegram still follow the preference.

   ONE MESSAGE PER EVENT. Every send is claimed first, through a unique
   constraint rather than a check-then-insert — two overlapping runs both pass
   a "has this been sent?" read and both send. An alert crossing is claimed by
   the alert row itself; a liquidation warning is claimed by position and
   threshold band, so drifting one percent does not re-notify. Nothing is
   claimed for someone no channel would reach: an alert nobody can be told
   about stays armed, exactly as before.

   NEVER A FIGURE WITHOUT ITS CHAIN. A notification is read on a lock screen
   with no dashboard beside it, so it carries the level, the current value,
   and what changed — not just that something happened.
--------------------------------------------------------------------------- */

export interface DeliveryReport {
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
}

export interface Recipient {
  userId: string;
  solanaAddress: string | null;
  /** A linked Telegram chat, when the Telegram surface is enabled. */
  chatId: number | null;
  /** Has the Android app — so has an inbox — even if push is off. */
  hasApp: boolean;
  devices: PushDeviceRow[];
}

/** One event, written once, rendered for each channel. Plain text throughout. */
export interface Outgoing {
  kind: NotificationKind;
  title: string;
  /** Body lines. Empty lines are dropped. */
  lines: string[];
  /** What a tap opens in the app, e.g. "/asset/SOL". */
  route: string;
}

export interface Channels {
  telegram: boolean;
  inbox: boolean;
  push: boolean;
}

/**
 * Where an event may go.
 *
 * `enabled` is the person's preference for this kind. `requested` is true
 * only for an alert they created, which reaches the inbox even when the kind
 * is switched off.
 */
export function channelsFor(recipient: Recipient, enabled: boolean, requested = false): Channels {
  return {
    telegram: recipient.chatId !== null && enabled,
    inbox: recipient.hasApp && (enabled || requested),
    push: enabled && recipient.devices.some((device) => device.disabled_at === null),
  };
}

export function anyChannel(channels: Channels): boolean {
  return channels.telegram || channels.inbox || channels.push;
}

function telegramHtml(message: Outgoing): string {
  return [`<b>${escapeHtml(message.title)}</b>`, "", ...message.lines.map(escapeHtml)].join("\n");
}

/** Sends one claimed event to the chosen channels. Each channel fails alone. */
export async function send(
  recipient: Recipient,
  channels: Channels,
  message: Outgoing,
  report: DeliveryReport,
): Promise<void> {
  const lines = message.lines.filter((line) => line.trim() !== "");
  const body = lines.join("\n");
  let delivered = false;

  let notificationId: string | null = null;
  if (channels.inbox) {
    notificationId = await addToInbox({
      userId: recipient.userId,
      kind: message.kind,
      title: message.title,
      body,
      data: { route: message.route },
    });
    if (notificationId === null) report.errors += 1;
    else delivered = true;
  }

  if (channels.push) {
    const pushed = await pushToDevices(
      recipient.devices,
      { kind: message.kind, title: message.title, body, data: { notificationId, route: message.route, accountId: recipient.userId } },
      notificationId,
    );
    if (pushed.sent > 0) delivered = true;
    if (pushed.failed > 0) report.errors += 1;
  }

  if (channels.telegram && recipient.chatId !== null) {
    try {
      await sendMessage(recipient.chatId, telegramHtml({ ...message, lines }));
      delivered = true;
    } catch {
      report.errors += 1;
    }
  }

  if (delivered) report.sent += 1;
}

/**
 * Everyone some channel can reach: every linked Telegram chat (when the
 * Telegram surface is on) and every account that has the app.
 */
async function recipients(): Promise<Map<string, Recipient>> {
  const map = new Map<string, Recipient>();
  const db = serviceClient();

  if (flags().telegram) {
    const { data } = await db
      .from("telegram_links")
      .select("user_id, telegram_chat_id, profiles(solana_address)")
      .limit(5000);
    for (const row of data ?? []) {
      const profile = row.profiles as unknown as { solana_address: string | null } | null;
      map.set(row.user_id, {
        userId: row.user_id,
        solanaAddress: profile?.solana_address ?? null,
        chatId: row.telegram_chat_id,
        hasApp: false,
        devices: [],
      });
    }
  }

  const appUsers = await accountsWithApp();
  const missing = appUsers.filter((userId) => !map.has(userId));
  if (missing.length > 0) {
    const { data } = await db.from("profiles").select("id, solana_address").in("id", missing);
    for (const row of data ?? []) {
      map.set(row.id, {
        userId: row.id,
        solanaAddress: row.solana_address ?? null,
        chatId: null,
        hasApp: false,
        devices: [],
      });
    }
  }

  const devices = await devicesFor(appUsers);
  for (const userId of appUsers) {
    const recipient = map.get(userId);
    if (recipient === undefined) continue;
    recipient.hasApp = true;
    recipient.devices = devices.get(userId) ?? [];
  }

  return map;
}

/** Preferences, read once per recipient per pass. A failed read is all-off. */
function preferencesReader(): (userId: string) => Promise<NotificationPreferences> {
  const cache = new Map<string, Promise<NotificationPreferences>>();
  return (userId) => {
    let read = cache.get(userId);
    if (read === undefined) {
      read = notificationPreferences(userId);
      cache.set(userId, read);
    }
    return read;
  };
}

type Preferences = ReturnType<typeof preferencesReader>;

const money = formatPriceUsd;

/* ---------------------------------------------------------------------------
   Price alerts
--------------------------------------------------------------------------- */

export function alertMessage(
  alert: { symbol: string; direction: "above" | "below"; target: number; createdPrice: number | null },
  price: number,
): Outgoing {
  const lines = [`Now: ${money(price)}`];

  /* The context that makes an alert actionable rather than merely true. */
  if (alert.createdPrice !== null) {
    const move = ((price - alert.createdPrice) / alert.createdPrice) * 100;
    lines.push(
      `Was ${money(alert.createdPrice)} when you set this (${move >= 0 ? "+" : ""}${move.toFixed(1)}%).`,
    );
  }

  lines.push("", "This alert is now off. Re-arm it in Elyra.");
  return {
    kind: "price_alert",
    title: `${alert.symbol} ${alert.direction === "above" ? "crossed above" : "fell below"} ${money(alert.target)}`,
    lines,
    route: `/asset/${encodeURIComponent(alert.symbol)}`,
  };
}

async function deliverPriceAlerts(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  const alerts = await armedAlerts();
  if (alerts.length === 0) return;

  /* The alert editor shows Pyth prices, so the crossing must use that same
     feed. Binance can differ enough to leave an already-crossed rule armed. */
  const symbols = [...new Set(alerts.map((alert) => alert.symbol))];
  const prices = new Map(
    (await pricesForSymbols(symbols)).map((feed) => [feed.symbol.toUpperCase(), feed.price]),
  );

  for (const alert of alerts) {
    report.scanned += 1;

    const price = prices.get(alert.symbol);
    /* An unpriceable symbol is not a crossing. Skipped, never assumed. */
    if (price === undefined) {
      report.skipped += 1;
      continue;
    }

    if (!hasCrossed(alert, price)) continue;

    const recipient = people.get(alert.userId);
    if (recipient === undefined) {
      report.skipped += 1;
      continue;
    }

    const prefs = await preferences(alert.userId);
    const channels = channelsFor(recipient, prefs.priceAlerts, true);
    if (!anyChannel(channels)) {
      report.skipped += 1;
      continue;
    }

    /* Claimed before sending. The row is the idempotency boundary, so two
       overlapping runs cannot both deliver this crossing. */
    if (!(await markTriggered(alert.id, price))) {
      report.skipped += 1;
      continue;
    }

    await send(recipient, channels, alertMessage(alert, price), report);
  }
}

/* ---------------------------------------------------------------------------
   Liquidation warnings
--------------------------------------------------------------------------- */

/** Bands, so drifting within one does not re-notify. */
const BANDS = [
  { pct: 5, label: "under 5%" },
  { pct: 10, label: "under 10%" },
  { pct: 20, label: "under 20%" },
];

function bandFor(headroomPct: number): { pct: number; label: string } | null {
  for (const band of BANDS) {
    if (headroomPct < band.pct) return band;
  }
  return null;
}

async function deliverLiquidationWarnings(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  for (const recipient of people.values()) {
    if (recipient.solanaAddress === null) continue;

    const prefs = await preferences(recipient.userId);
    const channels = channelsFor(recipient, prefs.liquidationAlerts);
    if (!anyChannel(channels)) continue;

    const positions = await routeDefiPositions(recipient.solanaAddress);
    if (!positions.ok || positions.data === undefined) {
      report.errors += 1;
      continue;
    }

    for (const position of positions.data) {
      report.scanned += 1;

      const headroom = liquidationHeadroom(position);
      /* No published threshold means no warning. Estimating a distance from
         leverage would produce an alarm nobody can act on and a silence that
         means nothing. */
      if (headroom === null) continue;

      const headroomPct = headroom * 100;
      const band = bandFor(headroomPct);
      if (band === null) continue;

      /* Claimed per position per band: crossing 20% notifies once, and
         drifting from 19% to 18% does not notify again. */
      const claimed = await claimNotification(recipient.userId, "liquidation", `${position.id}:${band.pct}`);
      if (!claimed) continue;

      await send(
        recipient,
        channels,
        {
          kind: "liquidation",
          title: `${position.label} is ${headroomPct.toFixed(1)}% from liquidation`,
          lines: [
            position.ltv === null || position.liquidationLtv === null
              ? ""
              : `LTV ${(position.ltv * 100).toFixed(1)}% against a ${(position.liquidationLtv * 100).toFixed(1)}% threshold.`,
            position.borrowedUsd === null
              ? ""
              : `Borrowed ${money(position.borrowedUsd)} against ${money(position.suppliedUsd ?? 0)}.`,
            "Elyra cannot act on this for you.",
          ],
          route: "/portfolio/defi",
        },
        report,
      );
    }
  }
}

/* ---------------------------------------------------------------------------
   Large moves
--------------------------------------------------------------------------- */

async function deliverLargeMoves(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  /* Keyed by the UTC day so a symbol that stays down all afternoon produces
     one message, not one per run. */
  const day = new Date().toISOString().slice(0, 10);

  for (const recipient of people.values()) {
    const prefs = await preferences(recipient.userId);
    const channels = channelsFor(recipient, prefs.largeMoves);
    if (!anyChannel(channels)) continue;

    const { data: watched } = await serviceClient()
      .from("watchlist")
      .select("symbol")
      .eq("user_id", recipient.userId)
      .limit(25);

    for (const row of watched ?? []) {
      report.scanned += 1;

      const ticker = await binanceTicker(row.symbol);
      if (!ticker.ok || ticker.data?.change24hPct === null || ticker.data === undefined) {
        continue;
      }

      const change = ticker.data.change24hPct;
      if (change === null || Math.abs(change) < prefs.moveThresholdPct) continue;

      const claimed = await claimNotification(
        recipient.userId,
        "large_move",
        `${row.symbol}:${day}:${change >= 0 ? "up" : "down"}`,
      );
      if (!claimed) continue;

      await send(
        recipient,
        channels,
        {
          kind: "large_move",
          title: `${row.symbol} ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% today`,
          lines: [`Now ${money(ticker.data.lastPrice)}.`],
          route: `/asset/${encodeURIComponent(row.symbol)}`,
        },
        report,
      );
    }
  }
}

/* ---------------------------------------------------------------------------
   Prediction markets

   Two things are worth telling someone about a prediction position they hold:
   the probability moved materially, and the market resolved in their favour
   with money sitting unclaimed.

   ── Points, not percent ────────────────────────────────────────────────

   A market going 54% -> 64% moved TEN POINTS. As a relative change it moved
   18.5%. People mean the first, so the threshold is in points and the
   message says points. Using the relative figure would fire roughly twice as
   often as asked and would be most wrong at the extremes, where a 2% market
   reaching 4% is a 100% "move" that means almost nothing.

   The "prediction order updates" preference is stored and shown, but no pass
   sends order updates yet — nothing here reads a person's prediction-market
   orders. It is not wired to anything rather than wired to a guess.
--------------------------------------------------------------------------- */

interface Mark {
  probability: number;
  recordedAt: string;
}

/** The last probability recorded for an outcome, for comparison. */
async function previousMarks(tokenIds: string[]): Promise<Map<string, Mark>> {
  if (tokenIds.length === 0) return new Map();

  const { data } = await serviceClient()
    .from("prediction_probability_marks")
    .select("token_id, probability, recorded_at")
    .in("token_id", tokenIds);

  const marks = new Map<string, Mark>();
  for (const row of data ?? []) {
    marks.set(row.token_id, {
      probability: Number(row.probability),
      recordedAt: row.recorded_at,
    });
  }
  return marks;
}

async function recordMark(
  tokenId: string,
  marketId: string,
  title: string,
  probability: number,
): Promise<void> {
  await serviceClient()
    .from("prediction_probability_marks")
    .upsert(
      {
        token_id: tokenId,
        market_id: marketId,
        title,
        probability,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "token_id" },
    );
}

async function deliverPredictionAlerts(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  for (const recipient of people.values()) {
    const prefs = await preferences(recipient.userId);
    const moves = channelsFor(recipient, prefs.predictionAlerts);
    const resolutions = channelsFor(recipient, prefs.predictionResolutionAlerts);
    if (!anyChannel(moves) && !anyChannel(resolutions)) continue;

    const account = await predictionAccount(recipient.userId);
    /* No linked account means nothing to compare against — not zero
       positions, just nothing to look at. Skipped silently, because a user
       who never linked one does not want to be told so every five minutes. */
    if (account === null) continue;

    const positions = await polymarketPositions(account.address);
    if (!positions.ok || positions.data === undefined) {
      report.errors += 1;
      continue;
    }

    const tokenIds = positions.data.map((position) => position.id);
    const marks = await previousMarks(tokenIds);

    for (const position of positions.data) {
      report.scanned += 1;
      const route = `/prediction/${encodeURIComponent(position.marketId)}`;

      /* ---- Resolved in the holder's favour ----

         `claimable` already means resolved AND still worth something — the
         provider flags losers as redeemable too, so the adapter filters them
         out. Without that, this branch would congratulate someone on a
         market they lost. */
      if (position.status === "claimable" && anyChannel(resolutions)) {
        const claimed = await claimNotification(recipient.userId, "prediction_resolution", position.id);
        if (claimed) {
          await send(
            recipient,
            resolutions,
            {
              kind: "prediction_resolution",
              title: "Prediction market resolved",
              lines: [
                position.marketTitle,
                `Your ${position.outcome} position settled in your favour.`,
                position.currentValueUsd === null ? "" : `Claimable: ${money(position.currentValueUsd)}`,
                "Claim it on the market's site.",
              ],
              route,
            },
            report,
          );
        }
        continue;
      }

      if (!anyChannel(moves)) continue;
      if (position.status !== "open" || position.currentPrice === null) continue;

      const previous = marks.get(position.id);

      /* First sighting: record the baseline and say nothing. An alert on the
         first reading would be a comparison against a number that does not
         exist. */
      if (previous === undefined) {
        await recordMark(position.id, position.marketId, position.marketTitle, position.currentPrice);
        continue;
      }

      const points = moveInPoints(previous.probability, position.currentPrice);
      if (Math.abs(points) < prefs.predictionMoveThresholdPoints) continue;

      /* Bucketed by the direction and the rounded level it reached, so a
         market oscillating around the threshold does not notify repeatedly. */
      const bucket = Math.round(position.currentPrice * 20) / 20;
      const claimed = await claimNotification(recipient.userId, "prediction_move", `${position.id}:${bucket}`);
      if (!claimed) continue;

      const from = Math.round(previous.probability * 1000) / 10;
      const to = Math.round(position.currentPrice * 1000) / 10;

      await send(
        recipient,
        moves,
        {
          kind: "prediction_move",
          title: "Prediction market update",
          lines: [
            position.marketTitle,
            `${position.outcome} probability ${from}% → ${to}% (${points >= 0 ? "+" : ""}${points.toFixed(1)} points)`,
            position.currentValueUsd === null ? "" : `Your position: ${money(position.currentValueUsd)}`,
            position.pnlUsd === null
              ? ""
              : `Open PnL: ${position.pnlUsd >= 0 ? "+" : ""}${money(position.pnlUsd)}`,
          ],
          route,
        },
        report,
      );
      await recordMark(position.id, position.marketId, position.marketTitle, position.currentPrice);
    }
  }
}

/* ---------------------------------------------------------------------------
   Daily summary
--------------------------------------------------------------------------- */

/**
 * The calendar date and minutes-past-midnight where this user lives.
 *
 * Their local clock, not the server's. A user in Tokyo who asked for 9am
 * means 9am in Tokyo, and a summary keyed on the server's date would arrive
 * mid-afternoon for half the world and repeat across the date boundary for
 * the other half.
 */
export function localClock(
  timezone: string,
  now: Date = new Date(),
): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const get = (type: string): string =>
      parts.find((part) => part.type === type)?.value ?? "";

    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = Number.parseInt(get("hour"), 10);
    const minute = Number.parseInt(get("minute"), 10);

    if (year === "" || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    return { date: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
  } catch {
    /* An unknown timezone. Null rather than falling back to UTC, which would
       send someone's summary at the wrong hour without ever saying why. */
    return null;
  }
}

/**
 * How long after the chosen minute a summary may still be sent.
 *
 * Wide enough to survive a missed cron run, narrow enough that a long outage
 * does not deliver "your morning summary" at bedtime. Past the window the day
 * is simply skipped.
 */
const SUMMARY_WINDOW_MINUTES = 90;

async function summaryFor(recipient: Recipient): Promise<Outgoing | null> {
  const snapshot = await composePortfolio({
    userId: recipient.userId,
    solanaAddress: recipient.solanaAddress,
    sessionWallet: null,
  });

  const total = snapshot.summary.totalValueUsd;
  /* Nothing to report is not a report. A daily message saying "$0.00" to
     someone with no connected sources trains them to mute it. */
  if (total === null && snapshot.spot.length === 0 && snapshot.perps.length === 0) {
    return null;
  }

  const lines = [`Total: ${total === null ? "unavailable" : money(total)}`];

  if (snapshot.summary.unrealizedPnlUsd !== null) {
    lines.push(`Open PnL: ${money(snapshot.summary.unrealizedPnlUsd)}`);
  }

  /* The biggest movers among what is actually counted, so the message says
     something the reader could act on rather than restating a total. */
  const movers = snapshot.spot
    .filter((holding) => holding.verified && holding.change24hPct !== null)
    .sort((a, b) => Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0))
    .slice(0, 3);

  if (movers.length > 0) {
    lines.push("Moved most:");
    for (const holding of movers) {
      const change = holding.change24hPct ?? 0;
      lines.push(
        `${holding.symbol} ${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%` +
          (holding.valueUsd === null ? "" : ` · ${money(holding.valueUsd)}`),
      );
    }
  }

  if (snapshot.partial) {
    const failed = snapshot.notes.filter((note) => note.kind === "failed").map((note) => note.scope);
    lines.push(`Incomplete — ${[...new Set(failed)].join(", ")} could not be read.`);
  }

  return { kind: "daily_summary", title: "Where your capital stands", lines, route: "/portfolio" };
}

async function deliverDailySummary(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  const now = new Date();

  for (const recipient of people.values()) {
    const prefs = await preferences(recipient.userId);
    const channels = channelsFor(recipient, prefs.dailySummary);
    if (!anyChannel(channels)) continue;

    report.scanned += 1;

    const clock = localClock(prefs.timezone, now);
    if (clock === null) {
      report.skipped += 1;
      continue;
    }

    const since = clock.minutes - prefs.dailySummaryMinute;
    /* Before their hour, or too long after it. Either way, not now. */
    if (since < 0 || since > SUMMARY_WINDOW_MINUTES) continue;

    /* Keyed on THEIR calendar date, so the window firing several times over
       ninety minutes still produces exactly one message per local day. */
    if (!(await claimNotification(recipient.userId, "daily_summary", clock.date))) {
      continue;
    }

    const message = await summaryFor(recipient);
    if (message === null) {
      report.skipped += 1;
      continue;
    }

    await send(recipient, channels, message, report);
  }
}

/* ---------------------------------------------------------------------------
   Prediction signal lifecycle and microstructure alerts

   Distinct from `deliverPredictionAlerts` above, which watches the PROBABILITY
   of markets a user holds. This one watches user-created rules and the
   lifecycle of signals Elyra generated — entry, target, invalidation — and it
   is driven by `lib/prediction/worker.ts`, which owns all the arithmetic and
   the claiming. Nothing here recomputes a threshold. The worker decides what
   fired; this function decides who may be told and sends it.
--------------------------------------------------------------------------- */

const LIFECYCLE_TITLE: Record<string, string> = {
  entered: "Signal entered",
  target_hit: "Target reached",
  invalidated: "Signal invalidated",
  expired: "Signal expired",
};

async function deliverPredictionSignalAlerts(
  people: Map<string, Recipient>,
  preferences: Preferences,
  report: DeliveryReport,
): Promise<void> {
  const { runPredictionWorker } = await import("@/lib/prediction/worker");

  const outcome = await runPredictionWorker();
  report.scanned += outcome.alertsChecked + outcome.signalsChecked;
  report.errors += outcome.errors;

  /* ---- Threshold rules the user created ---- */
  for (const fired of outcome.alertsFired) {
    const recipient = people.get(fired.userId);
    if (recipient === undefined) {
      report.skipped += 1;
      continue;
    }

    const prefs = await preferences(fired.userId);
    /* A rule they set themselves: the inbox always, push and Telegram only
       with prediction alerts on. */
    const channels = channelsFor(recipient, prefs.predictionAlerts, true);
    if (!anyChannel(channels)) {
      report.skipped += 1;
      continue;
    }

    await send(
      recipient,
      channels,
      {
        kind: "prediction_move",
        title: "Prediction alert",
        lines: [
          fired.marketQuestion ?? fired.marketId,
          fired.message,
          "This alert is now quiet until the condition clears.",
        ],
        route: `/prediction/${encodeURIComponent(fired.marketId)}`,
      },
      report,
    );
  }

  /* ---- Lifecycle transitions on generated signals ---- */
  for (const change of outcome.lifecycleChanges) {
    if (change.userId === null) continue;

    const recipient = people.get(change.userId);
    if (recipient === undefined) {
      report.skipped += 1;
      continue;
    }

    const prefs = await preferences(change.userId);
    const channels = channelsFor(recipient, prefs.predictionAlerts);
    if (!anyChannel(channels)) {
      report.skipped += 1;
      continue;
    }

    const title = LIFECYCLE_TITLE[change.status];
    /* Only the transitions worth interrupting someone for. A move to
       `waiting_entry` is bookkeeping, not news. */
    if (title === undefined) continue;

    await send(
      recipient,
      channels,
      {
        kind: "prediction_signal",
        title,
        lines: [
          `${change.marketQuestion} — ${change.outcomeLabel}`,
          change.reason,
          change.resultPoints === null
            ? ""
            : `Result ${change.resultPoints >= 0 ? "+" : ""}${change.resultPoints.toFixed(1)} points`,
          "Forward paper tracking. No order was placed.",
        ],
        route: `/prediction/signal/${encodeURIComponent(change.signalId)}`,
      },
      report,
    );
  }
}

/* ---------------------------------------------------------------------------
   The run
--------------------------------------------------------------------------- */

/**
 * One delivery pass.
 *
 * Each kind is independent: one throwing must not stop the others, because a
 * liquidation warning is the most important message this system sends and it
 * should not be lost to a price-alert bug.
 */
export async function deliverNotifications(): Promise<DeliveryReport> {
  const report: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };

  /* Receipts first, so a device that went away since the last pass is
     skipped in this one. */
  try {
    await checkReceipts();
  } catch (error) {
    console.error("[notifications] receipt check failed", error);
    report.errors += 1;
  }

  const people = await recipients();
  if (people.size === 0) return report;

  const preferences = preferencesReader();

  for (const pass of [
    deliverPriceAlerts,
    deliverLiquidationWarnings,
    deliverLargeMoves,
    deliverPredictionAlerts,
    deliverPredictionSignalAlerts,
    deliverDailySummary,
  ]) {
    try {
      await pass(people, preferences, report);
    } catch (error) {
      console.error("[notifications] delivery pass failed", error);
      report.errors += 1;
    }
  }

  console.log(JSON.stringify({ event: "notification-delivery", ...report }));
  return report;
}
