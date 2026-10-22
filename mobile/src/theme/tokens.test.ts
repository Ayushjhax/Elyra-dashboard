import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { color } from "~/theme/tokens";

/* No component holds a colour value (CLAUDE.md). ESLint catches a literal in
   code; this also catches one in a template string or a comment-free style
   object it cannot see, and checks the one colour app.config.ts must write
   out by hand. */

const SRC = join(__dirname, "..");
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

it("has no colour literal outside src/theme", () => {
  const offenders = files(SRC)
    .filter((path) => !relative(SRC, path).startsWith("theme"))
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => LITERAL.test(line.replace(/\/\/.*$|\/\*.*?\*\//g, "")))
        .map(({ index }) => `${relative(SRC, path)}:${index + 1}`),
    );
  expect(offenders).toEqual([]);
});

it("app.config.ts's surface colour is --surface-base", () => {
  const config = readFileSync(join(SRC, "..", "app.config.ts"), "utf8");
  const match = /export const SURFACE = "(#[0-9a-fA-F]{6})"/.exec(config);
  expect(match?.[1]?.toLowerCase()).toBe(color["surface-base"]);
});
