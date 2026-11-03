// Render stills straight from the composition.
//   node scripts/stills.mjs                 → the review set
//   node scripts/stills.mjs 0 200 600 2400  → specific frames
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
  0, 30, 116, 134, 152, 176, 196, 236, 290, 340, 380, 420, 462, 520, 580, 640, 690, 704, 745, 800, 835, 890,
  960, 1040, 1070, 1140, 1220, 1258, 1300, 1335, 1356, 1400, 1460, 1512, 1570, 1605, 1640, 1672, 1705, 1736,
  1785, 1830, 1880, 1950, 2020, 2080, 2150, 2190, 2214, 2245, 2285, 2325, 2370, 2400, 2550, 2699,
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
