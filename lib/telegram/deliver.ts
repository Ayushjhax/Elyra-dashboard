import "server-only";

import { escapeHtml } from "@/lib/personalized/render/telegram";
import { composePortfolio } from "@/lib/portfolio/compose";
import { binanceTicker } from "@/lib/providers/binance-public";
import { moveInPoints } from "@/lib/prediction/analytics";
import { predictionAccount } from "@/lib/prediction/account";
import { polymarketPositions } from "@/lib/providers/polymarket-account";
import { routeDefiPositions } from "@/lib/providers/router";
import { liquidationHeadroom } from "@/lib/providers/types";
import { serviceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";
import {
  armedAlerts,
  hasCrossed,
  markTriggered,
  type ArmedAlert,
} from "@/lib/telegram/alerts";
import {
  claimNotification,
  notificationPreferences,
} from "@/lib/telegram/notifications";

/* ---------------------------------------------------------------------------
   Notification delivery.

   Called on a schedule. Everything it sends is unsolicited, which sets the
   rules it works under:

   OPT-IN, CHECKED PER USER, EVERY TIME. Preferences are read for each
   recipient before anything is composed, and a failed read means send
   nothing. Linking a chat is consent to ask questions; it is not consent to
   be told things.

   ONE MESSAGE PER EVENT. Every send is claimed first, through a unique
   constraint rather than a check-then-insert — two overlapping runs both pass
   a "has this been sent?" read and both send. An alert crossing is claimed by
   the alert row itself; a liquidation warning is claimed by position and
   threshold band, so drifting one percent does not re-notify.

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

interface Recipient {
  userId: string;
  chatId: number;
  solanaAddress: string | null;
}

/** Every linked chat. The only place a chat id is resolved for a send. */
async function recipients(): Promise<Map<string, Recipient>> {
  const { data } = await serviceClient()
    .from("telegram_links")
    .select("user_id, telegram_chat_id, profiles(solana_address)")
    .limit(5000);

  const map = new Map<string, Recipient>();
  for (const row of data ?? []) {
    const profile = row.profiles as unknown as { solana_address: string | null } | null;
    map.set(row.user_id, {
      userId: row.user_id,
      chatId: row.telegram_chat_id,
      solanaAddress: profile?.solana_address ?? null,
    });
  }
  return map;
}

/* ---------------------------------------------------------------------------
   Price alerts
--------------------------------------------------------------------------- */

const money = (value: number): string =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

function alertMessage(alert: ArmedAlert, price: number): string {
  const lines = [
    `<b>${escapeHtml(alert.symbol)} ${alert.direction === "above" ? "crossed above" : "fell below"} ${money(alert.target)}</b>`,
    "",
    `Now: <b>${money(price)}</b>`,
  ];

  /* The context that makes an alert actionable rather than merely true. */
  if (alert.createdPrice !== null) {
    const move = ((price - alert.createdPrice) / alert.createdPrice) * 100;
    lines.push(
      `Was ${money(alert.createdPrice)} when you set this (${move >= 0 ? "+" : ""}${move.toFixed(1)}%).`,
    );
  }

  lines.push("", "<i>This alert is now off. Send it again to re-arm it.</i>");
  return lines.join("\n");
}

async function deliverPriceAlerts(
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  const alerts = await armedAlerts();
  if (alerts.length === 0) return;

  /* Priced once per symbol, not once per alert. Fifty users watching SOL is
     one upstream call, not fifty. */
  const symbols = [...new Set(alerts.map((alert) => alert.symbol))];
  const prices = new Map<string, number>();

  for (const symbol of symbols) {
    const ticker = await binanceTicker(symbol);
    if (ticker.ok && ticker.data !== undefined) prices.set(symbol, ticker.data.lastPrice);
  }

  for (const alert of alerts) {
    report.scanned += 1;

    const price = prices.get(alert.symbol);
    /* An unpriceable symbol is not a crossing. Skipped, never assumed. */
    if (price === undefined) {
      report.skipped += 1;
      continue;
    }

    if (!hasCrossed(alert, price)) continue;

    const chat = chats.get(alert.userId);
    if (chat === undefined) {
      report.skipped += 1;
      continue;
    }

    const preferences = await notificationPreferences(alert.userId);
    if (!preferences.priceAlerts) {
      report.skipped += 1;
      continue;
    }

    /* Claimed before sending. The row is the idempotency boundary, so two
       overlapping runs cannot both deliver this crossing. */
    if (!(await markTriggered(alert.id, price))) {
      report.skipped += 1;
      continue;
    }

    try {
      await sendMessage(chat.chatId, alertMessage(alert, price));
      report.sent += 1;
    } catch {
      report.errors += 1;
    }
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
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  for (const chat of chats.values()) {
    if (chat.solanaAddress === null) continue;

    const preferences = await notificationPreferences(chat.userId);
    if (!preferences.liquidationAlerts) continue;

    const positions = await routeDefiPositions(chat.solanaAddress);
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
      const claimed = await claimNotification(
        chat.userId,
        "liquidation",
        `${position.id}:${band.pct}`,
      );
      if (!claimed) continue;

      const message = [
        `<b>${escapeHtml(position.label)} is ${headroomPct.toFixed(1)}% from liquidation</b>`,
        "",
        position.ltv === null || position.liquidationLtv === null
          ? ""
          : `LTV ${(position.ltv * 100).toFixed(1)}% against a ${(position.liquidationLtv * 100).toFixed(1)}% threshold.`,
        position.borrowedUsd === null
          ? ""
          : `Borrowed ${money(position.borrowedUsd)} against ${money(position.suppliedUsd ?? 0)}.`,
        "",
        "<i>Elyra cannot act on this for you.</i>",
      ]
        .filter((line) => line !== "")
        .join("\n");

      try {
        await sendMessage(chat.chatId, message);
        report.sent += 1;
      } catch {
        report.errors += 1;
      }
    }
  }
}

/* ---------------------------------------------------------------------------
   Large moves
--------------------------------------------------------------------------- */

async function deliverLargeMoves(
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  /* Keyed by the UTC day so a symbol that stays down all afternoon produces
     one message, not one per run. */
  const day = new Date().toISOString().slice(0, 10);

  for (const chat of chats.values()) {
    const preferences = await notificationPreferences(chat.userId);
    if (!preferences.largeMoves) continue;

    const { data: watched } = await serviceClient()
      .from("watchlist")
      .select("symbol")
      .eq("user_id", chat.userId)
      .limit(25);

    for (const row of watched ?? []) {
      report.scanned += 1;

      const ticker = await binanceTicker(row.symbol);
      if (!ticker.ok || ticker.data?.change24hPct === null || ticker.data === undefined) {
        continue;
      }

      const change = ticker.data.change24hPct;
      if (change === null || Math.abs(change) < preferences.moveThresholdPct) continue;

      const claimed = await claimNotification(
        chat.userId,
        "large_move",
        `${row.symbol}:${day}:${change >= 0 ? "up" : "down"}`,
      );
      if (!claimed) continue;

      const message = [
        `<b>${escapeHtml(row.symbol)} ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% today</b>`,
        "",
        `Now ${money(ticker.data.lastPrice)}.`,
      ].join("\n");

      try {
        await sendMessage(chat.chatId, message);
        report.sent += 1;
      } catch {
        report.errors += 1;
      }
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
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  for (const chat of chats.values()) {
    const preferences = await notificationPreferences(chat.userId);
    if (!preferences.predictionAlerts && !preferences.predictionResolutionAlerts) {
      continue;
    }

    const account = await predictionAccount(chat.userId);
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

      /* ---- Resolved in the holder's favour ----

         `claimable` already means resolved AND still worth something — the
         provider flags losers as redeemable too, so the adapter filters them
         out. Without that, this branch would congratulate someone on a
         market they lost. */
      if (position.status === "claimable" && preferences.predictionResolutionAlerts) {
        const claimed = await claimNotification(
          chat.userId,
          "prediction_resolution",
          position.id,
        );
        if (claimed) {
          const message = [
            "<b>Prediction market resolved</b>",
            "",
            escapeHtml(position.marketTitle),
            "",
            `Your <b>${escapeHtml(position.outcome)}</b> position settled in your favour.`,
            position.currentValueUsd === null
              ? ""
              : `Claimable: <b>${money(position.currentValueUsd)}</b>`,
            "",
            "<i>Claim it in Elyra.</i>",
          ]
            .filter((line) => line !== "")
            .join("\n");

          try {
            await sendMessage(chat.chatId, message);
            report.sent += 1;
          } catch {
            report.errors += 1;
          }
        }
        continue;
      }

      if (!preferences.predictionAlerts) continue;
      if (position.status !== "open" || position.currentPrice === null) continue;

      const previous = marks.get(position.id);

      /* First sighting: record the baseline and say nothing. An alert on the
         first reading would be a comparison against a number that does not
         exist. */
      if (previous === undefined) {
        await recordMark(
          position.id,
          position.marketId,
          position.marketTitle,
          position.currentPrice,
        );
        continue;
      }

      const points = moveInPoints(previous.probability, position.currentPrice);
      if (Math.abs(points) < preferences.predictionMoveThresholdPoints) continue;

      /* Bucketed by the direction and the rounded level it reached, so a
         market oscillating around the threshold does not notify repeatedly. */
      const bucket = Math.round(position.currentPrice * 20) / 20;
      const claimed = await claimNotification(
        chat.userId,
        "prediction_move",
        `${position.id}:${bucket}`,
      );
      if (!claimed) continue;

      const from = Math.round(previous.probability * 1000) / 10;
      const to = Math.round(position.currentPrice * 1000) / 10;

      const message = [
        "<b>Prediction market update</b>",
        "",
        escapeHtml(position.marketTitle),
        "",
        `${escapeHtml(position.outcome)} probability`,
        `<b>${from}% → ${to}%</b> (${points >= 0 ? "+" : ""}${points.toFixed(1)} points)`,
        "",
        position.currentValueUsd === null
          ? ""
          : `Your position: ${money(position.currentValueUsd)}`,
        position.pnlUsd === null
          ? ""
          : `Open PnL: ${position.pnlUsd >= 0 ? "+" : ""}${money(position.pnlUsd)}`,
      ]
        .filter((line) => line !== "")
        .join("\n");

      try {
        await sendMessage(chat.chatId, message);
        report.sent += 1;
        await recordMark(
          position.id,
          position.marketId,
          position.marketTitle,
          position.currentPrice,
        );
      } catch {
        report.errors += 1;
      }
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

async function summaryFor(recipient: Recipient): Promise<string | null> {
  const snapshot = await composePortfolio({
    userId: recipient.userId,
    solanaAddress: recipient.solanaAddress,
    sessionWallet: null,
  });

  const total = snapshot.summary.totalValueUsd;
  /* Nothing to report is not a report. A daily message saying "$0.00" to
     someone with no connected sources trains them to mute the bot. */
  if (total === null && snapshot.spot.length === 0 && snapshot.perps.length === 0) {
    return null;
  }

  const lines = ["<b>Where your capital stands</b>", ""];
  lines.push(`Total: <b>${total === null ? "unavailable" : money(total)}</b>`);

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
    lines.push("", "<b>Moved most</b>");
    for (const holding of movers) {
      const change = holding.change24hPct ?? 0;
      lines.push(
        `${escapeHtml(holding.symbol)} ${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%` +
          (holding.valueUsd === null ? "" : ` · ${money(holding.valueUsd)}`),
      );
    }
  }

  if (snapshot.partial) {
    const failed = snapshot.notes
      .filter((note) => note.kind === "failed")
      .map((note) => note.scope);
    lines.push(
      "",
      `<i>Incomplete — ${escapeHtml([...new Set(failed)].join(", "))} could not be read.</i>`,
    );
  }

  return lines.join("\n");
}

async function deliverDailySummary(
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  const now = new Date();

  for (const chat of chats.values()) {
    const preferences = await notificationPreferences(chat.userId);
    if (!preferences.dailySummary) continue;

    report.scanned += 1;

    const clock = localClock(preferences.timezone, now);
    if (clock === null) {
      report.skipped += 1;
      continue;
    }

    const since = clock.minutes - preferences.dailySummaryMinute;
    /* Before their hour, or too long after it. Either way, not now. */
    if (since < 0 || since > SUMMARY_WINDOW_MINUTES) continue;

    /* Keyed on THEIR calendar date, so the window firing several times over
       ninety minutes still produces exactly one message per local day. */
    if (!(await claimNotification(chat.userId, "daily_summary", clock.date))) {
      continue;
    }

    const message = await summaryFor(chat);
    if (message === null) {
      report.skipped += 1;
      continue;
    }

    try {
      await sendMessage(chat.chatId, message);
      report.sent += 1;
    } catch {
      report.errors += 1;
    }
  }
}

/* ---------------------------------------------------------------------------
   The run
--------------------------------------------------------------------------- */

/**
 * One delivery pass.
 *
 * Each channel is independent: one throwing must not stop the others, because
 * a liquidation warning is the most important message this system sends and
 * it should not be lost to a price-alert bug.
 */
/* ---------------------------------------------------------------------------
   Prediction signal lifecycle and microstructure alerts

   Distinct from `deliverPredictionAlerts` above, which watches the PROBABILITY
   of markets a user holds. This one watches user-created rules and the
   lifecycle of signals Elyra generated — entry, target, invalidation — and it
   is driven by `lib/prediction/worker.ts`, which owns all the arithmetic.

   Nothing here recomputes a threshold. The worker decides what fired; this
   function decides who may be told and sends it.
--------------------------------------------------------------------------- */

const LIFECYCLE_TITLE: Record<string, string> = {
  entered: "Signal Entered",
  target_hit: "Target Reached",
  invalidated: "Signal Invalidated",
  expired: "Signal Expired",
};

async function deliverPredictionSignalAlerts(
  chats: Map<string, Recipient>,
  report: DeliveryReport,
): Promise<void> {
  const { runPredictionWorker } = await import("@/lib/prediction/worker");

  const outcome = await runPredictionWorker();
  report.scanned += outcome.alertsChecked + outcome.signalsChecked;
  report.errors += outcome.errors;

  /* ---- Threshold rules the user created ---- */
  for (const fired of outcome.alertsFired) {
    const chat = chats.get(fired.userId);
    if (chat === undefined) {
      report.skipped += 1;
      continue;
    }

    const preferences = await notificationPreferences(fired.userId);
    if (!preferences.predictionAlerts) {
      report.skipped += 1;
      continue;
    }

    const lines = [
      "<b>Prediction Alert</b>",
      "",
      escapeHtml(fired.marketQuestion ?? fired.marketId),
      "",
      escapeHtml(fired.message),
      "",
      "<i>This alert is now quiet until the condition clears.</i>",
    ];

    try {
      await sendMessage(chat.chatId, lines.join("\n"));
      report.sent += 1;
    } catch {
      report.errors += 1;
    }
  }

  /* ---- Lifecycle transitions on generated signals ---- */
  for (const change of outcome.lifecycleChanges) {
    if (change.userId === null) continue;

    const chat = chats.get(change.userId);
    if (chat === undefined) {
      report.skipped += 1;
      continue;
    }

    const preferences = await notificationPreferences(change.userId);
    if (!preferences.predictionAlerts) {
      report.skipped += 1;
      continue;
    }

    const title = LIFECYCLE_TITLE[change.status];
    /* Only the transitions worth interrupting someone for. A move to
       `waiting_entry` is bookkeeping, not news. */
    if (title === undefined) continue;

    const lines = [
      `<b>${escapeHtml(title)}</b>`,
      "",
      escapeHtml(change.marketQuestion),
      `<b>${escapeHtml(change.outcomeLabel)}</b>`,
      "",
      escapeHtml(change.reason),
    ];

    if (change.resultPoints !== null) {
      lines.push(
        "",
        `Result  ${change.resultPoints >= 0 ? "+" : ""}${change.resultPoints.toFixed(1)} points`,
      );
    }

    lines.push(
      "",
      "<i>Forward paper tracking. No order was placed.</i>",
    );

    try {
      await sendMessage(chat.chatId, lines.join("\n"));
      report.sent += 1;
    } catch {
      report.errors += 1;
    }
  }
}

export async function deliverNotifications(): Promise<DeliveryReport> {
  const report: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };

  const chats = await recipients();
  if (chats.size === 0) return report;

  for (const channel of [
    deliverPriceAlerts,
    deliverLiquidationWarnings,
    deliverLargeMoves,
    deliverPredictionAlerts,
    deliverPredictionSignalAlerts,
    deliverDailySummary,
  ]) {
    try {
      await channel(chats, report);
    } catch (error) {
      console.error("[telegram] delivery channel failed", error);
      report.errors += 1;
    }
  }

  console.log(JSON.stringify({ event: "telegram-delivery", ...report }));
  return report;
}

