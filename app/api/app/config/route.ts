import { NextResponse } from "next/server";
import { parseVersion } from "@/lib/appVersion";
import { flags } from "@/lib/flags";
import { transcriptionAvailable } from "@/lib/voice/transcribe";

/* ---------------------------------------------------------------------------
   GET /api/app/config — what the Android app needs before it shows anything.

   `minSupportedVersion`: a build older than this shows a blocking "Update
   Elyra" screen. Raise it only when an old build would break against this
   API — never to nudge people onto a new feature.

   `latestVersion`: lets a current-enough build mention that an update exists.

   `features`: capability flags, so the app hides what this deployment has
   turned off rather than showing a screen that errors.

   No auth: the version gate runs before sign-in, and nothing here is about an
   account. Both versions come from env (APP_MIN_SUPPORTED_VERSION,
   APP_LATEST_VERSION), so moving them needs no code change — on Vercel, a
   redeploy picks the new value up (docs/RELEASE.md). A malformed value is
   treated as unset rather than locking every build out.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function version(key: string, fallback: string | null): string | null {
  const value = process.env[key]?.trim() ?? "";
  return parseVersion(value) === null ? fallback : value;
}

export function GET(): Response {
  const flag = flags();
  return NextResponse.json(
    {
      minSupportedVersion: version("APP_MIN_SUPPORTED_VERSION", "0.0.0"),
      latestVersion: version("APP_LATEST_VERSION", null),
      features: {
        kamino: flag.kamino,
        raydium: flag.raydium,
        polymarket: flag.polymarket,
        hyperliquid: flag.hyperliquid,
        binancePublic: flag.binancePublic,
        transcription: transcriptionAvailable(),
      },
    },
    /* Short, so raising the minimum takes effect within minutes. */
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
