import "server-only";

/* ---------------------------------------------------------------------------
   Feature flags.

   Two kinds, and the difference matters.

   A CAPABILITY flag turns off something that works. `ENABLE_KAMINO=false`
   stops Elyra reading Kamino — used when an upstream is having a bad day and
   the failure is noisier than the absence. These default ON, because the
   feature is built and tested, and they are read at the point of use rather
   than cached so flipping one takes effect without a redeploy.

   A SURFACE flag turns off something that is exposed to users. `ENABLE_TELEGRAM`
   defaults on only when the credentials that make it work are present —
   a surface advertised without its bot token is a button that 500s.

   Read `process.env` directly and per call. Caching a flag in a module
   constant makes it a deploy-time decision, which defeats the point of having
   one during an incident.
--------------------------------------------------------------------------- */

/** A flag that is on unless explicitly disabled. */
function enabled(key: string): boolean {
  return process.env[key] !== "false";
}

export interface FeatureFlags {
  telegram: boolean;
  telegramMiniApp: boolean;
  kamino: boolean;
  raydium: boolean;
  polymarket: boolean;
  hyperliquid: boolean;
  binancePublic: boolean;
  /* Never on: no verified schema and no credential. See lib/providers/dflow.ts. */
  dflow: false;
}

export function flags(): FeatureFlags {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  /* Both, not either. The token sends and the secret authenticates the
     inbound webhook; a surface with one and not the other is either a bot
     nobody can talk to or an endpoint anyone can post to. */
  const telegramConfigured =
    botToken !== undefined &&
    botToken.length > 0 &&
    webhookSecret !== undefined &&
    webhookSecret.length > 0;

  return {
    telegram: telegramConfigured && enabled("ENABLE_TELEGRAM"),
    telegramMiniApp: telegramConfigured && enabled("ENABLE_TELEGRAM_MINI_APP"),
    kamino: enabled("ENABLE_KAMINO"),
    raydium: enabled("ENABLE_RAYDIUM"),
    polymarket: enabled("ENABLE_POLYMARKET"),
    hyperliquid: enabled("ENABLE_HYPERLIQUID"),
    binancePublic: enabled("ENABLE_BINANCE_PUBLIC"),
    dflow: false,
  };
}
