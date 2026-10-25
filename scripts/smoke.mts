/**
 * Smoke test for a deployed API (the Next app — website and Android API).
 *
 *   pnpm smoke                                   https://api.getelyra.xyz
 *   pnpm smoke -- --base https://getelyra.xyz    another deployment
 *   SMOKE_TOKEN=<Privy access token> pnpm smoke  + an authenticated read
 *   CRON_SECRET=<secret> pnpm smoke              + the delivery cron, dry run
 *   CRON_SECRET=<secret> pnpm smoke -- --live-cron   run a real delivery pass
 *
 * Read-only by default: the cron check calls /api/notifications/deliver with
 * ?dryRun=1, which checks the secret and sends nothing. --live-cron runs a real
 * pass (it can notify people), so it is never the default.
 *
 * The token and the secret are read from the environment and never printed.
 * Get a token from a signed-in browser on the website: DevTools → Application
 * → Local storage → `privy:token` (without the quotes), or from the app.
 *
 * Self-contained (no `@/` imports), so `node --experimental-strip-types` runs
 * it without a bundler, like the other scripts here.
 */

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE = (baseArg >= 0 ? args[baseArg + 1] : process.env.SMOKE_BASE ?? "https://api.getelyra.xyz").replace(/\/+$/, "");
const LIVE_CRON = args.includes("--live-cron");
const TOKEN = process.env.SMOKE_TOKEN?.trim() ?? "";
const CRON_SECRET = process.env.CRON_SECRET?.trim() ?? "";
const APP_VERSION = "1.0.0";

type Outcome = "pass" | "fail" | "skip" | "warn";
const results: { name: string; outcome: Outcome; detail: string }[] = [];

function record(name: string, outcome: Outcome, detail: string): void {
  results.push({ name, outcome, detail });
  const mark = { pass: "PASS", fail: "FAIL", skip: "SKIP", warn: "WARN" }[outcome];
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ status: number; json: unknown; ms: number }> {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = { nonJson: text.slice(0, 80) };
  }
  return { status: response.status, json, ms: Date.now() - started };
}

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    record(name, "fail", error instanceof Error ? error.message : String(error));
  }
}

/* What a feature needs to work at all; anything else missing is a warning. */
const REQUIRED = ["auth", "database", "prices", "solanaRpc", "agent"];

console.log(`Smoke test against ${BASE}\n`);

await check("GET /api/health", async () => {
  const { status, json, ms } = await call("/api/health");
  const body = json as { ok?: boolean; version?: string; commit?: string | null; configured?: Record<string, boolean> };
  if (status !== 200 || body?.ok !== true) return record("GET /api/health", "fail", `${status} ${JSON.stringify(json).slice(0, 120)}`);
  const missing = Object.entries(body.configured ?? {}).filter(([, on]) => !on).map(([key]) => key);
  const missingRequired = missing.filter((key) => REQUIRED.includes(key));
  record(
    "GET /api/health",
    missingRequired.length > 0 ? "fail" : "pass",
    `${ms}ms · version ${body.version} · commit ${body.commit ?? "—"}${missing.length ? ` · not configured: ${missing.join(", ")}` : ""}`,
  );
});

await check("GET /api/app/config", async () => {
  const { status, json, ms } = await call("/api/app/config");
  const body = json as { minSupportedVersion?: string; latestVersion?: string | null; features?: Record<string, boolean> };
  if (status !== 200 || typeof body?.minSupportedVersion !== "string") {
    return record("GET /api/app/config", "fail", `${status} ${JSON.stringify(json).slice(0, 120)}`);
  }
  const off = Object.entries(body.features ?? {}).filter(([, on]) => !on).map(([key]) => key);
  record("GET /api/app/config", "pass", `${ms}ms · min ${body.minSupportedVersion} · latest ${body.latestVersion ?? "unset"}${off.length ? ` · features off: ${off.join(", ")}` : ""}`);
});

await check("GET /.well-known/assetlinks.json", async () => {
  const { status, json } = await call("/.well-known/assetlinks.json");
  const statements = Array.isArray(json) ? (json as { relation: string[] }[]) : [];
  if (status === 404) return record("GET /.well-known/assetlinks.json", "warn", "404 — ANDROID_CERT_SHA256 not set (App Links and passkeys off)");
  const relations = statements.flatMap((statement) => statement.relation);
  record("GET /.well-known/assetlinks.json", status === 200 && relations.length > 0 ? "pass" : "fail", `${status} · ${relations.join(", ")}`);
});

await check("Signed out is refused", async () => {
  const { status } = await call("/api/alerts", { headers: { "x-elyra-app": APP_VERSION } });
  record("Signed out is refused", status === 401 ? "pass" : "fail", `GET /api/alerts without a token → ${status} (want 401)`);
});

await check("DELETE /api/account exists", async () => {
  /* Without a token: proves the route is deployed, deletes nothing. */
  const { status } = await call("/api/account", { method: "DELETE" });
  record("DELETE /api/account exists", status === 401 ? "pass" : "fail", `without a token → ${status} (want 401; 404 means an old deployment)`);
});

if (TOKEN === "") {
  record("Authenticated read", "skip", "set SMOKE_TOKEN to a Privy access token");
} else {
  await check("Authenticated read", async () => {
    const { status, json, ms } = await call("/api/alerts", {
      headers: { authorization: `Bearer ${TOKEN}`, "x-elyra-app": APP_VERSION },
    });
    const body = json as { alerts?: unknown[]; appDelivery?: string; error?: string };
    record(
      "Authenticated read",
      status === 200 && Array.isArray(body?.alerts) ? "pass" : "fail",
      status === 200 ? `${ms}ms · GET /api/alerts → ${body.alerts?.length} alerts, app delivery ${body.appDelivery}` : `${status} ${body?.error ?? ""}`,
    );
  });
}

await check("Cron refuses a wrong secret", async () => {
  const { status } = await call("/api/notifications/deliver?dryRun=1", { headers: { authorization: "Bearer not-the-secret" } });
  record("Cron refuses a wrong secret", status === 401 ? "pass" : "fail", `→ ${status} (want 401)`);
});

if (CRON_SECRET === "") {
  record("Cron with CRON_SECRET", "skip", "set CRON_SECRET to check the scheduler's credentials");
} else {
  const path = LIVE_CRON ? "/api/notifications/deliver" : "/api/notifications/deliver?dryRun=1";
  const name = LIVE_CRON ? "Cron, live pass" : "Cron with CRON_SECRET (dry run)";
  await check(name, async () => {
    const { status, json, ms } = await call(path, { headers: { authorization: `Bearer ${CRON_SECRET}` } }, 300_000);
    record(name, status === 200 ? "pass" : "fail", `${status} · ${ms}ms · ${JSON.stringify(json).slice(0, 160)}`);
  });
}

const failed = results.filter((result) => result.outcome === "fail").length;
const counts = (["pass", "warn", "skip", "fail"] as const).map((outcome) => `${results.filter((r) => r.outcome === outcome).length} ${outcome}`).join(", ");
console.log(`\n${counts}`);
process.exit(failed > 0 ? 1 : 0);
