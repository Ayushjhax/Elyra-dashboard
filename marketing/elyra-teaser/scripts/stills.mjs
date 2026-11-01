// Renders representative stills (and a contact sheet) from the composition.
// Usage: node scripts/stills.mjs [frame ...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = process.env.STILLS_DIR ?? path.join(root, "out", "stills");
fs.mkdirSync(outDir, { recursive: true });
const frames = process.argv.slice(2).map(Number);
const list = frames.length ? frames : [0, 60, 120, 160, 230, 330, 420, 460, 520, 575, 625, 675, 725, 775, 840, 880, 930, 965, 1000, 1100];

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const browser = await openBrowser("chrome", { browserExecutable: process.env.REMOTION_BROWSER ?? null });
const composition = await selectComposition({ serveUrl, id: "ElyraTeaser", puppeteerInstance: browser });
for (const frame of list) {
  const output = path.join(outDir, `frame-${String(frame).padStart(4, "0")}.png`);
  await renderStill({ composition, serveUrl, frame, output, puppeteerInstance: browser, scale: Number(process.env.STILL_SCALE ?? 1) });
  console.log(output);
}
await browser.close({ silent: true });
