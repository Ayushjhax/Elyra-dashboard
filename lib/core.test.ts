import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_MODULES } from "@/lib/core";

/* ---------------------------------------------------------------------------
   The shared core stays pure.

   Walks every import — type-only included — from each module the app shares
   and fails on anything that would not run, or not type-check, in React
   Native: framework and server packages, Node built-ins, env, and the
   browser's globals.
--------------------------------------------------------------------------- */

const ROOT = resolve(__dirname, "..");

/** Packages the shared core may use: pure JavaScript, installable in the app. */
const ALLOWED_PACKAGES = new Set(["zod", "qr"]);

const FORBIDDEN_CODE: Array<[RegExp, string]> = [
  [/\bprocess\.env\b/, "reads process.env"],
  [/\btypeof window\b|\bwindow\.(location|navigator|document|addEventListener|removeEventListener|matchMedia|innerWidth|innerHeight|open|scroll|localStorage|sessionStorage)\b/, "touches window"],
  [/\bdocument\./, "touches document"],
  [/\blocalStorage\b/, "touches localStorage"],
  [/(^|[^.\w])fetch\(/, "calls fetch"],
];

/** Source without comments, so prose never reads as an import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

/** Code without comments or string contents, so neither trips a check. */
function code(source: string): string {
  return withoutComments(source).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1] ?? match[2]);
  return found;
}

function resolveLocal(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${from}`);
}

function violations(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue = CORE_MODULES.map((module) => join(ROOT, module));

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const name = file.slice(ROOT.length + 1);

    if (!existsSync(file)) {
      problems.push(`${name}: listed but missing`);
      continue;
    }
    if (name.endsWith(".tsx")) problems.push(`${name}: a component, not pure code`);

    const source = readFileSync(file, "utf8");
    for (const specifier of specifiers(withoutComments(source))) {
      const local = resolveLocal(specifier, file);
      if (local !== null) {
        if (/^(components|app)\//.test(local.slice(ROOT.length + 1))) {
          problems.push(`${name}: imports ${specifier} (UI or route code)`);
        }
        queue.push(local);
        continue;
      }
      const pkg = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      if (!ALLOWED_PACKAGES.has(pkg)) problems.push(`${name}: imports package ${specifier}`);
    }

    const stripped = code(source);
    for (const [pattern, what] of FORBIDDEN_CODE) {
      if (pattern.test(stripped)) problems.push(`${name}: ${what}`);
    }
  }
  return problems;
}

describe("the shared core", () => {
  it("is pure all the way down", () => {
    expect(violations()).toEqual([]);
  });
});
