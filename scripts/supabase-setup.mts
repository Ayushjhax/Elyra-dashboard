/**
 * Points this app at a Supabase project, and says what is still missing.
 *
 *   npm run supabase:setup                     diagnose what .env.local names
 *   npm run supabase:setup -- --url https://abc.supabase.co \
 *                             --anon-key eyJ... --service-key eyJ...
 *   npm run supabase:setup -- ... --write      also rewrite .env.local
 *
 * Written for the case that produced it: the configured project had been
 * deleted, so every server read failed with "TypeError: fetch failed" and
 * nothing anywhere said which host, or that a host was even involved.
 *
 * This checks, in order, the three things that can be wrong — the URL does
 * not resolve, the keys do not belong to it, the tables are not there — and
 * stops at the first, because a key check against a project that does not
 * exist tells you nothing.
 *
 * Deliberately self-contained, with no `@/` imports, so
 * `node --experimental-strip-types` runs it without a bundler resolving path
 * aliases. Same reasoning as scripts/set-telegram-webhook.mts.
 */

/* Makes this a module, so the top-level awaits below are legal. */
export {};

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { lookup } from "node:dns/promises";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* Absent or unreadable. The checks below report what is actually
       missing, which is more useful than "no .env.local". */
  }
}

/* ---------------------------------------------------------------------------
   Arguments
--------------------------------------------------------------------------- */

const argv = process.argv.slice(2);

function flag(name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`--${name} needs a value.`);
  }
  return value.trim();
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const write = argv.includes("--write");
const url = flag("url") ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const anonKey =
  flag("anon-key") ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const serviceKey =
  flag("service-key") ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

if (url.length === 0) {
  fail(
    "No project URL. Pass --url https://<ref>.supabase.co, or set " +
      "NEXT_PUBLIC_SUPABASE_URL in .env.local.",
  );
}

let host: string;
try {
  host = new URL(url).host;
} catch {
  fail(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`);
}

console.log(`\n  Project  ${url}`);

/* ---------------------------------------------------------------------------
   1. Does the host exist?

   Checked before anything is sent, because a fetch to a name that does not
   resolve reports "fetch failed" and buries the only fact that matters. A
   PAUSED project still resolves — so NXDOMAIN here is specifically a project
   that was deleted, or a typed ref, and never a project asleep.
--------------------------------------------------------------------------- */

try {
  const { address } = await lookup(host);
  console.log(`  DNS      ${host} → ${address}`);
} catch (error: unknown) {
  const code = (error as { code?: string }).code ?? "";
  if (code === "ENOTFOUND") {
    fail(
      `${host} does not exist (DNS returns NXDOMAIN).\n\n` +
        "  A paused project still resolves, so this is not a sleeping project.\n" +
        "  It was deleted, or the ref in the URL is wrong.\n\n" +
        "  Create one at https://supabase.com/dashboard, then re-run this with\n" +
        "  its URL and both keys:\n\n" +
        "    npm run supabase:setup -- --url https://<ref>.supabase.co \\\n" +
        "      --anon-key <anon> --service-key <service_role> --write\n",
    );
  }
  fail(`Could not resolve ${host}: ${code || String(error)}`);
}

/* ---------------------------------------------------------------------------
   2. Do the keys belong to it?

   A key carries the project ref in its own payload, so a key pasted from
   another project is caught here rather than as a 401 on the first real
   query. Only the ref is read; nothing else in the token is inspected and
   nothing is printed but the comparison.
--------------------------------------------------------------------------- */

function refOf(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    const ref = (payload as { ref?: unknown }).ref;
    return typeof ref === "string" ? ref : null;
  } catch {
    return null;
  }
}

const projectRef = host.split(".")[0];

for (const [name, key] of [
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
] as const) {
  if (key.length === 0) {
    fail(`${name} is not set. Copy it from the project's API settings.`);
  }
  const ref = refOf(key);
  if (ref !== null && ref !== projectRef) {
    fail(
      `${name} belongs to project "${ref}", but the URL names "${projectRef}".\n` +
        "  Both keys must come from the same project as the URL.",
    );
  }
}
console.log(`  Keys     both carry ref ${projectRef}`);

/* ---------------------------------------------------------------------------
   3. Are the tables there?

   PostgREST answers a missing table from its own schema cache with PGRST205
   before Postgres is asked, so that code — not just Postgres's 42P01 — is
   what a fresh project actually returns.
--------------------------------------------------------------------------- */

/** Every table the app reads, and the migration that creates it. */
const TABLES: Record<string, string> = {
  profiles: "my-app/supabase/migrations/0001_init.sql",
  exchange_accounts: "my-app/supabase/migrations/0001_init.sql",
  watchlist: "my-app/supabase/migrations/0001_init.sql",
  telegram_links: "my-app/supabase/migrations/0001_init.sql",
  telegram_link_codes: "my-app/supabase/migrations/0001_init.sql",
  telegram_updates: "my-app/supabase/migrations/0001_init.sql",
  conversations: "my-app/supabase/migrations/0001_init.sql",
  messages: "my-app/supabase/migrations/0001_init.sql",
  agent_runs: "my-app/supabase/migrations/0001_init.sql",
  market_cache: "my-app/supabase/migrations/0001_init.sql",
  usage_counters: "my-app/supabase/migrations/0001_init.sql",
  smart_money_findings: "elyra-signals/migrations/0002_smart_money.sql",
  portfolio_snapshots: "my-app/supabase/migrations/0004_portfolio_snapshots.sql",
};

async function tableExists(table: string): Promise<boolean | string> {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=0`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "request failed";
  }

  if (response.ok) return true;
  if (response.status === 401 || response.status === 403) {
    return "the service role key was rejected";
  }

  const body = (await response.json().catch(() => ({}))) as { code?: string };
  if (body.code === "PGRST205" || body.code === "42P01") return false;
  return `HTTP ${response.status}${body.code ? ` (${body.code})` : ""}`;
}

const missing: string[] = [];
const broken: string[] = [];

for (const table of Object.keys(TABLES)) {
  const result = await tableExists(table);
  if (result === true) continue;
  if (result === false) missing.push(table);
  else broken.push(`${table}: ${result}`);
}

if (broken.length > 0) {
  fail(`The project answered, but these reads failed:\n    ${broken.join("\n    ")}`);
}

if (missing.length === 0) {
  console.log("  Tables   all present\n");
} else {
  const files = [...new Set(missing.map((table) => TABLES[table]))];
  console.log(`  Tables   ${missing.length} missing: ${missing.join(", ")}\n`);
  console.log("  Run these in the project's SQL editor, in this order:\n");
  for (const file of files) {
    console.log(`    ${file}`);
  }
  console.log(
    "\n  Each is idempotent (`create table if not exists`), so running one\n" +
      "  twice changes nothing.\n",
  );
}

/* ---------------------------------------------------------------------------
   4. Write the credentials back, only when asked.

   Rewrites the three keys in place rather than appending: a second
   NEXT_PUBLIC_SUPABASE_URL further down the file silently wins over the
   first, which is a confusing way to spend an afternoon.
--------------------------------------------------------------------------- */

if (!write) {
  if (flag("url") !== null) {
    console.log("  Nothing written. Re-run with --write to update .env.local.\n");
  }
  process.exit(0);
}

const envPath = resolve(process.cwd(), ".env.local");
let contents: string;
try {
  contents = await readFile(envPath, "utf8");
} catch {
  contents = "";
}

for (const [key, value] of [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
] as const) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\n*$/, "\n")}${line}\n`;
}

await writeFile(envPath, contents, "utf8");
console.log("  Wrote .env.local. Restart `npm run dev` to pick it up.\n");
