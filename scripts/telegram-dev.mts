/**
 * Points the Telegram bot at the local dev server, in one command.
 *
 *   npm run telegram:dev
 *
 * Opens a Cloudflare quick tunnel to localhost, waits until it genuinely
 * serves this app, writes the hostname it was given into APP_URL, registers
 * the webhook, and then stays in the foreground holding the tunnel open.
 * Ctrl-C closes it.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 *
 * Doing it by hand is four steps that must all be right at once: the dev
 * server running, a tunnel up, APP_URL matching the hostname that tunnel was
 * *this time*, and the webhook re-registered against it. Miss any one and
 * the bot goes quiet with no error anywhere in the app's logs — the requests
 * never arrive, so nothing logs them. Every failure looks identical from the
 * outside: a bot that ignores you.
 *
 * It is also not a one-time setup. A quick tunnel gets a NEW random hostname
 * every start and dies with the process, so those four steps come back every
 * single time the tunnel restarts. That is what this collapses.
 *
 * Self-contained on purpose — no `@/` imports — so
 * `node --experimental-strip-types` runs it without a bundler.
 */

export {};

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 3000);
const ENV_FILE = ".env.local";
const TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * Every exit path that owns the tunnel goes through here.
 *
 * `child.kill()` only *sends* a signal; `process.exit()` on the next line
 * leaves before it is delivered, and cloudflared survives as an orphan — a
 * public ingress to this machine that nothing is now managing and no message
 * on screen mentions. Observed exactly once, which is once more than a public
 * tunnel should outlive the process that opened it. So the signal is awaited,
 * with SIGKILL behind it, and a synchronous kill is registered on `exit` as
 * the last resort for paths that never reach here at all.
 */
async function stopTunnel(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null || child.killed) return;

  await new Promise<void>((resolve) => {
    const done = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3_000);

    child.once("exit", () => {
      clearTimeout(done);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function abort(child: ChildProcess | null, message: string): Promise<never> {
  await stopTunnel(child);
  fail(message);
}

function log(message: string): void {
  console.log(`  ${message}`);
}

/**
 * The webhook route answers 401 without the secret header — see the note in
 * set-telegram-webhook.mts on why that is the signal we want.
 *
 * `next dev` compiles each route on demand, the FIRST time anything hits it —
 * this route included — and that compile can run past ten seconds on a large
 * app. Observed directly: a real 401, logged by Next itself at 14.5s, arrived
 * a moment after an earlier, shorter timeout here had already given up and
 * reported the server as unreachable. So this waits long enough to sit on the
 * far side of a cold compile rather than racing it.
 */
async function servesTheApp(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/telegram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    return response.status === 401;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   1. The dev server must already be up.

   Started separately rather than by this script: `next dev` owns a terminal,
   watches files and prints the errors you actually need while developing.
   Swallowing it into a child process here would bury all of that.
--------------------------------------------------------------------------- */

log("");
if (!(await servesTheApp(`http://localhost:${PORT}`))) {
  fail(
    `Nothing is serving this app on http://localhost:${PORT}\n\n` +
      "    Start it in another terminal first:\n" +
      "        npm run dev\n\n" +
      "    then re-run this. (If it IS running, check the port — this looks\n" +
      `    for ${PORT}; override with PORT=xxxx npm run telegram:dev)`,
  );
}
log(`dev server           http://localhost:${PORT} ✓`);

/* ---------------------------------------------------------------------------
   2. The tunnel.
--------------------------------------------------------------------------- */

const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

/* The backstop. `exit` handlers must be synchronous, so this cannot await the
   signal — but it fires on paths that bypass `stopTunnel` entirely, including
   an uncaught throw. */
process.on("exit", () => {
  if (tunnel.exitCode === null && !tunnel.killed) tunnel.kill("SIGKILL");
});

tunnel.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") {
    fail(
      "cloudflared is not installed.\n\n" +
        "    brew install cloudflared",
    );
  }
  fail(`Could not start cloudflared: ${error.message}`);
});

/** Resolves with the first trycloudflare hostname cloudflared announces. */
const tunnelUrl = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("cloudflared did not announce a URL within 30s")),
    30_000,
  );

  const scan = (chunk: Buffer): void => {
    const found = TUNNEL_PATTERN.exec(chunk.toString());
    if (found === null) return;
    clearTimeout(timer);
    resolve(found[0]);
  };

  /* cloudflared prints the banner carrying the URL to stderr, not stdout. */
  tunnel.stderr.on("data", scan);
  tunnel.stdout.on("data", scan);

  tunnel.on("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`cloudflared exited with code ${code} before giving a URL`));
  });
}).catch((error: Error) => abort(tunnel, error.message));

log(`tunnel               ${tunnelUrl}`);

/* The hostname exists the moment cloudflared prints it, but reaching it does
   not: the DNS record for a quick tunnel is created per-tunnel (there is no
   wildcard — a dead one returns NXDOMAIN), and the edge needs a moment to
   route to the origin. Registering inside that gap is how you end up with a
   webhook pointed at something that 530s, which is the whole failure this
   script exists to prevent, so it is waited out rather than assumed.

   Generous on purpose. A resolver that answered NXDOMAIN once will serve that
   negative answer from cache for its TTL, so the window has to outlast the
   cache rather than the propagation alone.

   Bounded by WALL CLOCK, not attempt count: `servesTheApp` itself now waits
   up to 30s for a cold compile, so counting attempts alone could in the
   worst case (every single one timing out) run for the better part of an
   hour. A deadline is the only bound that stays true regardless of how slow
   any one attempt turns out to be. */
process.stdout.write("  routing             ");
let routed = false;
const routingDeadline = Date.now() + 90_000;
while (Date.now() < routingDeadline) {
  if (await servesTheApp(tunnelUrl)) {
    routed = true;
    break;
  }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 1_500));
}
console.log("");

if (!routed) {
  await abort(
    tunnel,
    `The tunnel came up but ${tunnelUrl} never served this app\n` +
      `    within 90s.\n\n` +
      "    Most often DNS: the record for a fresh quick tunnel takes a moment,\n" +
      "    and a resolver that already answered NXDOMAIN for it will keep\n" +
      "    doing so until that negative answer expires. Waiting a minute and\n" +
      "    re-running usually clears it.\n\n" +
      "    Otherwise the dev server has stopped, or it is answering something\n" +
      "    other than 401 on /api/telegram/webhook.",
  );
}
log(`routing              ✓`);

/* ---------------------------------------------------------------------------
   3. APP_URL, rewritten in place.

   Only the APP_URL line is touched — every other line, comment and blank is
   written back byte for byte. This file holds live secrets; a rewrite that
   reformats it is a rewrite that can quietly corrupt one.
--------------------------------------------------------------------------- */

let envText: string;
try {
  envText = readFileSync(ENV_FILE, "utf8");
} catch {
  fail(`Could not read ${ENV_FILE}`);
}

const APP_URL_LINE = /^APP_URL=.*$/m;
const nextLine = `APP_URL=${tunnelUrl}`;

const updated = APP_URL_LINE.test(envText)
  ? envText.replace(APP_URL_LINE, nextLine)
  : `${envText.replace(/\n*$/, "\n")}${nextLine}\n`;

writeFileSync(ENV_FILE, updated);
log(`APP_URL              written to ${ENV_FILE}`);

/* ---------------------------------------------------------------------------
   4. Register, reusing the one script that knows how.

   Spawned rather than reimplemented: that script also registers the command
   menu and runs its own reachability preflight, and two copies of this logic
   is how they drift.
--------------------------------------------------------------------------- */

const registered = await new Promise<number>((resolve) => {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "scripts/set-telegram-webhook.mts"],
    { stdio: "inherit", env: { ...process.env, APP_URL: tunnelUrl } },
  );
  child.on("exit", (code) => resolve(code ?? 1));
});

if (registered !== 0) {
  await abort(tunnel, "Registering the webhook failed — see above.");
}

log("");
log("The bot is now pointed at this machine. Send it /portfolio to check.");
log("Ctrl-C closes the tunnel — the webhook then points at a dead host");
log("until you run this again.");
log("");

/* Hold the process open for as long as the tunnel lives. */
tunnel.on("exit", (code) => {
  console.log(`\n  Tunnel closed (code ${code}). The webhook is now stale.\n`);
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    tunnel.kill();
  });
}
