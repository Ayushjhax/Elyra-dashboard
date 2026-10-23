import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { color, motion, palette, radius, shadowPop, space, type } from "@/lib/tokens";

/* ---------------------------------------------------------------------------
   lib/tokens.ts mirrors app/globals.css. These tests fail when either side
   changes without the other.
--------------------------------------------------------------------------- */

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every custom property declared in a top-level `:root` or `@theme` block, last one winning. */
function declared(): Map<string, string> {
  const values = new Map<string, string>();
  for (const block of css.matchAll(/(?:^|\n)(?::root|@theme)\s*\{([\s\S]*?)\n\}/g)) {
    for (const match of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      values.set(match[1], match[2].trim().replace(/\s+/g, " "));
    }
  }
  return values;
}

/** The declarations inside `@utility type-<name>`. */
function utility(name: string): Record<string, string> {
  const block = new RegExp(`@utility type-${name} \\{([^}]*)\\}`).exec(css);
  if (block === null) throw new Error(`No @utility type-${name} in globals.css`);
  return Object.fromEntries([...block[1].matchAll(/([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const tokens = declared();

describe("lib/tokens.ts against app/globals.css", () => {
  it("holds every colour at its final value", () => {
    for (const [name, value] of Object.entries({ ...palette, ...color })) {
      expect([name, tokens.get(name)?.toLowerCase()]).toEqual([name, value.toLowerCase()]);
    }
  });

  it("holds the radii, spacing, motion and the pop shadow", () => {
    for (const [name, value] of Object.entries(radius)) expect([name, tokens.get(`radius-${name}`)]).toEqual([name, `${value}px`]);
    for (const [name, value] of Object.entries(space)) expect([name, tokens.get(name)]).toEqual([name, `${value}px`]);
    expect(tokens.get("dur-fast")).toBe(`${motion["dur-fast"]}ms`);
    expect(tokens.get("dur-base")).toBe(`${motion["dur-base"]}ms`);
    expect(tokens.get("dur-slow")).toBe(`${motion["dur-slow"]}ms`);
    expect(tokens.get("ease")).toBe(`cubic-bezier(${motion.ease.join(", ")})`);
    expect(tokens.get("shadow-pop")).toBe(
      `${shadowPop.offsetX} ${shadowPop.offsetY}px ${shadowPop.blur}px ${shadowPop.color}`,
    );
  });

  it("holds the type scale", () => {
    for (const [name, role] of Object.entries(type)) {
      const rule = utility(name);
      const face = rule["font-family"].includes("display") ? "display" : rule["font-family"].includes("mono") ? "mono" : "sans";
      const tracking = rule["letter-spacing"] === undefined || rule["letter-spacing"] === "0" ? 0 : Number.parseFloat(rule["letter-spacing"]);
      expect({ name, face, size: rule["font-size"], lineHeight: rule["line-height"], weight: Number(rule["font-weight"]) }).toEqual({
        name,
        face: role.face,
        size: `${role.size}px`,
        lineHeight: `${role.lineHeight}px`,
        weight: role.weight,
      });
      expect([name, role.letterSpacing]).toEqual([name, Math.round(tracking * role.size * 1000) / 1000]);
      expect([name, role.tabular]).toEqual([name, rule["font-variant-numeric"] === "tabular-nums"]);
      expect([name, role.uppercase]).toEqual([name, rule["text-transform"] === "uppercase"]);
    }
  });
});
