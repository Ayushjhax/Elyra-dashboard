#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Writes src/generated/licenses.json — the Open-source licences screen —
   from the dependencies this app actually ships.

   `pnpm licenses list --prod` names every production package (dev tools such
   as jest and eslint are not in the app, so they are not listed). Each
   package's own licence file is read from node_modules, because most
   licences require their text, with its copyright line, to travel with the
   software. Packages whose text is identical share one copy.

   Run after changing dependencies: `pnpm licenses:generate`. The test in
   src/lib/licenses.test.ts fails while the file is out of date.
--------------------------------------------------------------------------- */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src/generated/licenses.json");

/* The app itself is not a dependency of itself. */
const SELF = new Set(["elyra-mobile"]);

const listed = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
);

/* name@version → directory, over the hoisted tree and every nested one. */
const directories = new Map();
function walk(modules) {
  if (!existsSync(modules)) return;
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith(".")) continue;
    const scoped = entry.startsWith("@");
    const names = scoped ? readdirSync(join(modules, entry)).map((name) => `${entry}/${name}`) : [entry];
    for (const name of names) {
      const directory = join(modules, name);
      const manifest = join(directory, "package.json");
      if (!existsSync(manifest)) continue;
      try {
        const { version } = JSON.parse(readFileSync(manifest, "utf8"));
        const key = `${name}@${version}`;
        if (!directories.has(key)) directories.set(key, directory);
      } catch {
        /* Not a package. */
      }
      walk(join(directory, "node_modules"));
    }
  }
}
walk(join(root, "node_modules"));

function licenceText(directory) {
  if (directory === undefined) return null;
  const file = readdirSync(directory).find((name) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name));
  return file === undefined ? null : readFileSync(join(directory, file), "utf8").replace(/\r\n/g, "\n").trim();
}

const texts = [];
const textIndex = new Map();
const packages = [];

for (const [licence, entries] of Object.entries(listed)) {
  for (const entry of entries) {
    if (SELF.has(entry.name)) continue;
    for (const version of entry.versions) {
      const text = licenceText(directories.get(`${entry.name}@${version}`));
      let index = null;
      if (text !== null) {
        if (!textIndex.has(text)) {
          textIndex.set(text, texts.length);
          texts.push(text);
        }
        index = textIndex.get(text);
      }
      packages.push({
        name: entry.name,
        version,
        license: entry.license ?? licence,
        ...(entry.author ? { author: String(entry.author) } : {}),
        ...(entry.homepage ? { homepage: String(entry.homepage) } : {}),
        text: index,
      });
    }
  }
}

packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ packages, texts })}\n`);
console.log(`Wrote ${packages.length} packages, ${texts.length} distinct licence texts → ${out}`);
