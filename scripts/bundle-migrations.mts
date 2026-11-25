/**
 * Rebuilds supabase/migrations/_apply_all.sql from the individual migrations.
 *
 *   npm run supabase:bundle            rewrite the bundle
 *   npm run supabase:bundle -- --check exit 1 if it is stale
 *
 * The bundle exists so a fresh database can be set up with one paste into the
 * SQL editor. It went stale three migrations in a row when it was maintained
 * by hand, which is why this exists: `--check` belongs in CI, so a new
 * migration that is not in the bundle fails the build rather than quietly
 * shipping a setup path that creates half a schema.
 *
 * Self-contained — no `@/` imports — so `node --experimental-strip-types`
 * runs it without a bundler resolving path aliases.
 */

export {};

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const HEADER = `-- ---------------------------------------------------------------------------
-- Everything a fresh Elyra database needs, in order, in one paste.
--
-- GENERATED. Assembled from the files listed below; edit those, not this.
-- Regenerate with:  npm run supabase:bundle
--
-- Every statement is idempotent, so pasting this twice changes nothing and
-- pasting it over a partially-migrated database fills in what is missing.
--
-- 0003_repair.sql is deliberately NOT here: it repairs databases created from
-- an older 0001, and 0001 already carries those \`alter table ... if not
-- exists\` statements itself. Running it against a fresh database is a no-op.
-- ---------------------------------------------------------------------------

`;

/* Order matters — later migrations reference earlier tables. Listed rather
   than globbed so that adding a migration is a deliberate edit here, and so
   the signals repo's file can sit in the middle where it belongs. */
const SOURCES = [
  "supabase/migrations/0001_init.sql",
  "../elyra-signals/migrations/0002_smart_money.sql",
  "supabase/migrations/0004_portfolio_snapshots.sql",
  "supabase/migrations/0005_personalized.sql",
  "supabase/migrations/0006_referrals.sql",
  "supabase/migrations/0007_telegram_capital_os.sql",
  "supabase/migrations/0008_prediction_markets.sql",
  "supabase/migrations/0009_research.sql",
  "supabase/migrations/0010_backtests.sql",
  "supabase/migrations/0011_prediction_signals.sql",
  "supabase/migrations/0012_prepared_action_signature.sql",
  "supabase/migrations/0013_delivery_schedule.sql",
  "supabase/migrations/0014_android_app.sql",
  "supabase/migrations/0015_push_receipts.sql",
  "supabase/migrations/0016_app_notification_accounts.sql",
  "supabase/migrations/0017_intelligent_portfolios.sql",
  "supabase/migrations/0018_trading_automation.sql",
  "supabase/migrations/0019_trading_shorts.sql",
  "supabase/migrations/0020_trading_limit_orders.sql",
  "supabase/migrations/0021_arena.sql",
  "supabase/migrations/0022_agent_keys.sql",
  "supabase/migrations/0023_events.sql",
  "supabase/migrations/0024_agent_rails.sql",
  "supabase/migrations/0025_ai_funds.sql",
  "supabase/migrations/0027_daily_briefing.sql",
  "supabase/migrations/0028_trading_fills.sql",
  "supabase/migrations/0029_copy_trading.sql",
  "supabase/migrations/0030_strategy_designs.sql",
  "supabase/migrations/0031_insider_watch.sql",
  "supabase/migrations/0032_paper_account.sql",
  "supabase/migrations/0033_market_reports.sql",
  "supabase/migrations/0034_portfolio_tracking.sql",
  "supabase/migrations/0035_scout.sql",
  "supabase/migrations/0036_arena_leagues.sql",
  "supabase/migrations/0037_desk.sql",
];

/** The signals repo's migration, which is not checked out on every machine. */
const SIGNALS = "../elyra-signals/migrations/0002_smart_money.sql";

const TARGET = "supabase/migrations/_apply_all.sql";

const headerFor = (name: string) => {
  const bar = "=".repeat(Math.max(4, Math.floor((62 - name.length - 2) / 2)));
  return `-- ${bar} ${name} ${bar}\n`;
};

/**
 * The signals migration's section as the current bundle already carries it,
 * for a machine without the signals repo. Null when the bundle has none.
 */
async function bundledSection(name: string): Promise<string | null> {
  const existing = await readFile(TARGET, "utf8").catch(() => "");
  const header = headerFor(name);
  const start = existing.indexOf(header);
  if (start === -1) return null;
  const from = start + header.length;
  const next = existing.slice(from).search(/^-- =+ \d{4}_[a-z0-9_]+\.sql =+$/m);
  return (next === -1 ? existing.slice(from) : existing.slice(from, from + next)).trimEnd();
}

async function build(): Promise<string> {
  const parts: string[] = [HEADER];

  for (const path of SOURCES) {
    const name = basename(path);
    let body: string;
    try {
      body = await readFile(path, "utf8");
    } catch {
      const kept = path === SIGNALS ? await bundledSection(name) : null;
      if (kept === null) {
        console.error(`\n  ✗ Missing migration: ${path}\n`);
        process.exit(1);
      }
      console.warn(`  ! ${path} is not checked out; keeping the bundle's copy of ${name}`);
      body = kept;
    }

    parts.push(headerFor(name));
    parts.push(`${body.trimEnd()}\n\n`);
  }

  return parts.join("");
}

const bundled = await build();

if (process.argv.includes("--check")) {
  const existing = await readFile(TARGET, "utf8").catch(() => "");
  if (existing !== bundled) {
    console.error(
      `\n  ✗ ${TARGET} is out of date.\n` +
        "    Run: npm run supabase:bundle\n",
    );
    process.exit(1);
  }
  console.log(`\n  ✓ ${TARGET} is up to date\n`);
  process.exit(0);
}

await writeFile(TARGET, bundled, "utf8");

const tables = (bundled.match(/create table if not exists/g) ?? []).length;
console.log(
  `\n  ✓ ${TARGET}\n` +
    `    ${SOURCES.length} migrations · ${tables} tables · ${bundled.split("\n").length} lines\n`,
);