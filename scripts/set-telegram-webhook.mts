/**
 * Registers (or inspects, or removes) the Telegram webhook from env vars.
 *
 *   pnpm telegram:webhook            register APP_URL/api/telegram/webhook
 *   pnpm telegram:webhook -- --info  show what Telegram currently has
 *   pnpm telegram:webhook -- --delete
 *
 * Run this whenever the tunnel URL changes. It is deliberately self-contained
 * — no `@/` imports — so `node --experimental-strip-types` can run it without
 * a bundler resolving path aliases.
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

await call("setWebhook", {
  url,
  secret_token: secret,
  /* The only update type this bot reads. Anything else is delivery Telegram
     would retry and the webhook would acknowledge and discard. */
  allowed_updates: ["message"],
  max_connections: 40,
});

const info = await call("getWebhookInfo");

console.log(`\n  Webhook set\n`);
console.log(`  url                        ${url}`);
console.log(`  secret_token               set (${secret.length} chars)`);
console.log(`  pending_update_count       ${info.pending_update_count ?? 0}`);
if (info.last_error_message) {
  console.log(`  last_error_message         ${info.last_error_message}`);
}
console.log("");
