import { readFileSync } from "node:fs";
import { join } from "node:path";
import licenses from "~/generated/licenses.json";

/* The Open-source licences screen is generated (scripts/licenses.mjs). This
   fails while it is out of date: every dependency the app declares must be
   listed at the version installed. Fix with `pnpm licenses:generate`. */

const root = join(__dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };

describe("open-source licences", () => {
  it.each(Object.keys(manifest.dependencies))("lists %s at its installed version", (name) => {
    const installed = (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
    expect(licenses.packages.some((entry) => entry.name === name && entry.version === installed)).toBe(true);
  });

  it("points every package at a licence text that exists", () => {
    for (const entry of licenses.packages) {
      if (entry.text !== null) expect(typeof licenses.texts[entry.text]).toBe("string");
    }
  });
});
