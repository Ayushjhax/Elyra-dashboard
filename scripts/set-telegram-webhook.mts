/**
 * Registers (or inspects, or removes) the Telegram webhook from env vars.
 *
 *   npm run telegram:webhook            register APP_URL/api/telegram/webhook
 *   npm run telegram:webhook -- --info  show what Telegram currently has
 *   npm run telegram:webhook -- --delete
 *   npm run telegram:webhook -- --force register without the reachability check
 *
 * Also registers the bot's command menu, so the typed "/" list matches what
 * the bot actually answers.
 *
 * Reads .env.local then .env. Nothing it prints contains a secret: the token
 * lives in the request path, which this never echoes.
 *
 * Run this whenever the tunnel URL changes. It is deliberately self-contained
 * — no `@/` imports — so `node --experimental-strip-types` can run it without
 * a bundler resolving path aliases.
 *
 * ── Why this checks the URL before registering ─────────────────────────
 *
 * A quick tunnel gets a NEW random hostname every time it starts, and dies
 * with the process. Telegram keeps posting to whatever it was last told,
 * forever, and reports the failure only inside `getWebhookInfo` — nowhere
 * the operator is looking. So the bot goes quiet with no error anywhere in
 * the app's own logs, because the requests never arrive to be logged.
 *
 * That is not hypothetical: the webhook was found registered to a
 * `trycloudflare.com` host that no longer resolved, with Telegram logging
 * "Wrong response from the webhook: 530" against it and the bot appearing
 * simply broken. Registering is the one moment this script can catch that,
 * so it refuses a URL nothing answers rather than writing it and reporting
 * success.
 */

/* Makes this a module, so the top-level awaits below are legal. */
export {};

const ENV_FILES = [".env.local", ".env"];

for (const file of ENV_FILES) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* Absent or unreadable. The checks below report what is actually
       missing, which is more useful than "no .env.local". */
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const appUrl = process.env.APP_URL?.trim();

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN is not set.");

const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function call(
  method: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(api(method), {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };

  if (!payload.ok) fail(`${method} failed: ${payload.description ?? "unknown"}`);
  return (payload.result ?? {}) as Record<string, unknown>;
}

const mode = process.argv.includes("--delete")
  ? "delete"
  : process.argv.includes("--info")
    ? "info"
    : "set";

if (mode === "info") {
  const info = await call("getWebhookInfo");
  console.log("\n  Current webhook\n");
  for (const [key, value] of Object.entries(info)) {
    console.log(`  ${key.padEnd(26)} ${JSON.stringify(value)}`);
  }

  /* The fields above are the raw truth, and are still printed. This is the
     reading of them, because the failure that matters is legible only if you
     already know which field to look at — a bot that has gone silent shows
     up here as a `last_error_message` from seconds ago, next to a `url` that
     no longer exists, and neither line announces itself. */
  const lastError =
    typeof info.last_error_message === "string" ? info.last_error_message : null;
  const lastErrorAt =
    typeof info.last_error_date === "number" ? info.last_error_date : null;
  const pending =
    typeof info.pending_update_count === "number" ? info.pending_update_count : 0;

  console.log("");
  if (lastError !== null) {
    const agoSeconds =
      lastErrorAt === null ? null : Math.max(0, Math.round(Date.now() / 1000 - lastErrorAt));
    const ago =
      agoSeconds === null
        ? "at an unknown time"
        : agoSeconds < 120
          ? `${agoSeconds}s ago`
          : agoSeconds < 7200
            ? `${Math.round(agoSeconds / 60)}m ago`
            : `${Math.round(agoSeconds / 3600)}h ago`;

    console.log(`  Telegram could not deliver ${ago}: ${lastError}`);
    console.log(
      "  Updates are not reaching the app. If that url is a tunnel, it is\n" +
        "  down or has a new hostname — set APP_URL and re-run without --info.",
    );
  } else if (pending > 0) {
    console.log(`  ${pending} update(s) queued and no delivery error — the app is slow, not unreachable.`);
  } else {
    console.log("  No delivery errors reported.");
  }
  console.log("");
  process.exit(0);
}

if (mode === "delete") {
  await call("deleteWebhook", { drop_pending_updates: false });
  console.log("\n  Webhook removed.\n");
  process.exit(0);
}

if (!secret) {
  fail(
    "TELEGRAM_WEBHOOK_SECRET is not set. Generate one with:\n" +
      "    openssl rand -hex 32",
  );
}
if (secret.length < 32) {
  fail(
    `TELEGRAM_WEBHOOK_SECRET is ${secret.length} characters; use at least 32.`,
  );
}
if (!appUrl) fail("APP_URL is not set.");

const url = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

if (!url.startsWith("https://")) {
  /* Telegram will not deliver to plain http, and refuses to localhost — the
     usual fix is a tunnel, so say that rather than letting the API reject it
     with something less specific. */
  fail(
    `Telegram only delivers to https. APP_URL is ${appUrl}.\n` +
      "    For local development, expose the port with a tunnel and set\n" +
      "    APP_URL to the https URL it gives you.",
  );
}

/* ---------------------------------------------------------------------------
   Can anything actually be reached at that URL?

   Posted WITHOUT the secret header on purpose. A correctly deployed webhook
   answers 401 to that — it is the one response that proves both "something
   is listening" and "it is this app, with its secret configured". Every other
   answer means something specific and fixable, so each is named rather than
   collapsed into "could not reach it".
--------------------------------------------------------------------------- */

async function preflight(target: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(
      `Nothing answered at ${target}\n` +
        `    (${reason})\n\n` +
        "    Telegram would post every update into that void and report the\n" +
        "    failure only in getWebhookInfo, so this refuses to register it.\n\n" +
        "    If this is a tunnel URL, the tunnel is down or has been given a\n" +
        "    new hostname — quick tunnels get a fresh one every start. Bring\n" +
        "    it up, put the https URL it prints into APP_URL, and re-run.\n\n" +
        "    Registering anyway: --force",
    );
  }

  if (response.status === 401) return; /* The healthy answer. */

  if (response.status === 404) {
    fail(
      `${target} answered 404.\n\n` +
        "    Something is serving that host, but it is not this app — a\n" +
        "    different deployment, or a marketing site on the same domain.\n" +
        "    Point APP_URL at wherever my-app is actually served.\n\n" +
        "    Registering anyway: --force",
    );
  }

  if (response.status === 200) {
    fail(
      `${target} answered 200 to a request carrying no secret header.\n\n` +
        "    The route acknowledges an unauthenticated update, which means\n" +
        "    TELEGRAM_WEBHOOK_SECRET is not set where the app is running.\n" +
        "    Anyone who finds the URL could drive the bot. Set it there and\n" +
        "    re-run.\n\n" +
        "    Registering anyway: --force",
    );
  }

  fail(
    `${target} answered ${response.status}, where 401 was expected.\n\n` +
      "    A healthy webhook rejects an update with no secret header. This\n" +
      "    is something else — a proxy, an error page, or the app failing to\n" +
      "    boot.\n\n" +
      "    Registering anyway: --force",
  );
}

if (process.argv.includes("--force")) {
  console.log("\n  --force · skipping the reachability check\n");
} else {
  await preflight(url);
}

await call("setWebhook", {
  url,
  secret_token: secret,
  /* Exactly what the webhook handles, and nothing more. `callback_query` is
     not optional: without it Telegram never delivers a button tap, so every
     inline keyboard in the bot silently does nothing. Anything absent here is
     delivery Telegram would retry and the webhook would discard. */
  allowed_updates: ["message", "edited_message", "callback_query"],
  max_connections: 40,
});

/* ---------------------------------------------------------------------------
   The typed "/" menu.

   Registered from the same place as the webhook so the two cannot drift. A
   menu offering a command the bot does not answer is worse than no menu: the
   user reads it as the product being broken rather than as a stale list.
--------------------------------------------------------------------------- */

const COMMANDS = [
  { command: "portfolio", description: "Total capital across every venue" },
  { command: "wallet", description: "Your token holdings" },
  { command: "positions", description: "Exposure and concentration" },
  { command: "defi", description: "Lending, leverage and vault positions" },
  { command: "predictions", description: "Prediction markets and your exposure" },
  { command: "research", description: "Filings, recap, signals, yield, unlocks" },
  { command: "recap", description: "What moved" },
  { command: "signals", description: "Evidence-backed observations — /signals SOL" },
  { command: "yield", description: "Kamino vault rates" },
  { command: "unlocks", description: "Upcoming token unlocks" },
  { command: "backtest", description: "Historical strategy simulation — /backtest SOL rsi 1h 1y" },
  { command: "orderbook", description: "Live prediction order book — /orderbook fed september" },
  { command: "basket", description: "Elyra Probability Basket — /basket fed september" },
  { command: "price", description: "A quick price — /price SOL" },
  { command: "markets", description: "Funding and mark price for a symbol" },
  { command: "swap", description: "A live quote — /swap 1.5 SOL to USDC" },
  { command: "alert", description: "Tell me when it crosses — /alert SOL > 120" },
  { command: "alerts", description: "What Elyra sends you" },
  { command: "watch", description: "Your watchlist — /watch add SOL" },
  { command: "report", description: "A short written report" },
  { command: "settings", description: "Open Elyra" },
  { command: "help", description: "What I can do" },
];

await call("setMyCommands", { commands: COMMANDS });

const info = await call("getWebhookInfo");

console.log(`\n  Webhook set · ${COMMANDS.length} commands registered\n`);
console.log(`  url                        ${url}`);
console.log(`  secret_token               set (${secret.length} chars)`);
console.log(`  pending_update_count       ${info.pending_update_count ?? 0}`);
if (info.last_error_message) {
  console.log(`  last_error_message         ${info.last_error_message}`);
}
console.log("");
