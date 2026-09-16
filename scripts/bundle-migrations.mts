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
];

const TARGET = "supabase/migrations/_apply_all.sql";

async function build(): Promise<string> {
  const parts: string[] = [HEADER];

  for (const path of SOURCES) {
    let body: string;
    try {
      body = await readFile(path, "utf8");
    } catch {
      console.error(`\n  ✗ Missing migration: ${path}\n`);
      process.exit(1);
    }

    const name = basename(path);
    const bar = "=".repeat(Math.max(4, Math.floor((62 - name.length - 2) / 2)));
    parts.push(`-- ${bar} ${name} ${bar}\n`);
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
