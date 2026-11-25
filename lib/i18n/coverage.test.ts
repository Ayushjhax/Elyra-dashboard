import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { zhCN } from "./messages/zh-CN";
import { placeholders } from "./translate";

/* ---------------------------------------------------------------------------
   Every literal key has a Chinese entry.

   Walks app/, components/ and lib/ for `t("…")`, `translateNow("…")`,
   `msg("…")` and `pageMetadata("…", "…")`, and fails on any key the
   Simplified Chinese dictionary does not hold — so new English text cannot
   ship without its translation. Keys passed through a variable are not
   seen here; they live in messages/zh-CN/dynamic.ts.
--------------------------------------------------------------------------- */

const ROOT = resolve(__dirname, "../..");
const CALLS = new Set(["t", "translateNow", "msg", "pageMetadata"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "messages", "api"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) sources(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function literalKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of ["app", "components", "lib"].flatMap((dir) => sources(join(ROOT, dir)))) {
    const text = readFileSync(file, "utf8");
    if (!/\b(t|translateNow|msg|pageMetadata)\(/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALLS.has(node.expression.text)) {
        const args = node.expression.text === "pageMetadata" ? node.arguments.slice(0, 2) : node.arguments.slice(0, 1);
        for (const arg of args) {
          if ((ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && !keys.has(arg.text)) {
            keys.set(arg.text, relative(ROOT, file));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
}

describe("Simplified Chinese", () => {
  const keys = literalKeys();

  it("finds the keys it checks", () => {
    expect(keys.size).toBeGreaterThan(2000);
  });

  it("translates every literal key in the code", () => {
    const missing = [...keys].filter(([key]) => zhCN[key] === undefined).map(([key, file]) => `${file}: ${JSON.stringify(key)}`);
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder, and no others", () => {
    const sorted = (text: string) => placeholders(text).sort().join(",");
    const wrong = Object.entries(zhCN)
      .filter(([key, value]) => sorted(key) !== sorted(value))
      .map(([key, value]) => `${JSON.stringify(key)} → ${JSON.stringify(value)}`);
    expect(wrong).toEqual([]);
  });

  it("leaves no entry empty", () => {
    expect(Object.entries(zhCN).filter(([, value]) => value.trim() === "").map(([key]) => key)).toEqual([]);
  });
});
