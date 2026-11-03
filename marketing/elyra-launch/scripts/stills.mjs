// Render stills straight from the composition.
//   node scripts/stills.mjs                 → the review set
//   node scripts/stills.mjs 0 100 500 2300  → specific frames
// Output: out/stills/f####.png (and out/stills/contact.jpg for the review set).
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out", "stills");
mkdirSync(out, { recursive: true });

const REVIEW = [
  0, 30, 96, 136, 190, 240, 280, 320, 362, 420, 480, 540, 590, 604, 645, 700, 735, 790,
  860, 940, 970, 1040, 1120, 1158, 1200, 1235, 1256, 1300, 1360, 1412, 1470, 1505, 1540, 1572, 1605, 1636,
  1685, 1730, 1780, 1850, 1920, 1980, 2050, 2090, 2114, 2145, 2185, 2225, 2270, 2300, 2450, 2599,
];
const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const frames = args.length ? args : REVIEW;
const scale = Number(process.env.SCALE ?? 1);

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir: path.join(root, "public") });
const inputProps = { withAudio: false };
const composition = await selectComposition({ serveUrl, id: "ElyraLaunch", inputProps });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;

for (const frame of frames) {
  const file = path.join(out, `f${String(frame).padStart(4, "0")}.png`);
  await renderStill({ composition, serveUrl, output: file, frame, inputProps, scale, browserExecutable, chromiumOptions: { gl: "angle" } });
  process.stdout.write(`${frame} `);
}
process.stdout.write("\n");

if (!args.length) {
  const list = frames.map((f) => path.join(out, `f${String(f).padStart(4, "0")}.png`));
  const inputs = list.flatMap((p) => ["-i", p]);
  const cols = 6;
  const rows = Math.ceil(list.length / cols);
  const pads = list.map((_, i) => `[${i}:v]scale=480:-1[v${i}]`).join(";");
  const ins = list.map((_, i) => `[v${i}]`).join("");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${pads};${ins}xstack=inputs=${list.length}:layout=${layoutString(list.length, cols)}:fill=black`, path.join(out, "contact.jpg")]);
  console.log(`contact sheet: ${path.join(out, "contact.jpg")} (${cols}×${rows})`);
}

function layoutString(n, cols) {
  const w = 480, h = 270;
  return Array.from({ length: n }, (_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join("|");
}
