import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { ATTRIBUTION_MAX_AGE_SECONDS, isWellFormedCode } from "@/lib/referrals/config";

/* ---------------------------------------------------------------------------
   The referral code that brought this phone here — the app's version of the
   website's `elyra_ref` cookie (app/r/[code]/route.ts).

   A referral link opened before sign-in keeps its code in secure storage.
   FIRST TOUCH: a held code is never replaced by a later link, and it lapses
   after the cookie's own max-age (30 days), so a link from months ago never
   attributes a sign-up today.

   The code travels as `x-elyra-referral` on authenticated requests until
   one succeeds, and is then forgotten. The server reads it exactly once —
   when a new account's profile is created — and ignores it for an account
   that already existed, as it ignores the cookie (lib/referrals/attribution.ts).
   It is a public code, not a secret; secure storage keeps it out of plain
   app storage all the same.
--------------------------------------------------------------------------- */

const KEY = "elyra.referral";

interface Held {
  code: string;
  /** Epoch ms the link was opened. */
  at: number;
}

let held: Held | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function live(entry: Held | null, now = Date.now()): Held | null {
  return entry !== null && now - entry.at < ATTRIBUTION_MAX_AGE_SECONDS * 1000 ? entry : null;
}

async function load(): Promise<Held | null> {
  if (loaded) return live(held);
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw === null ? null : (JSON.parse(raw) as Partial<Held>);
    held = parsed && typeof parsed.code === "string" && isWellFormedCode(parsed.code) && typeof parsed.at === "number" ? { code: parsed.code, at: parsed.at } : null;
  } catch {
    held = null;
  }
  loaded = true;
  if (held !== null && live(held) === null) await forgetReferral();
  emit();
  return live(held);
}

/** Keeps a code from a referral link — unless one is already held (first touch). */
export async function rememberReferral(code: string): Promise<void> {
  const normalised = code.trim().toUpperCase();
  if (!isWellFormedCode(normalised)) return;
  if ((await load()) !== null) return;
  held = { code: normalised, at: Date.now() };
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(held));
  } catch {
    /* Kept in memory for this session even if the store refused it. */
  }
  emit();
}

/** The code to send on a request, if one is held and still in date. */
export async function referralForRequest(): Promise<string | null> {
  return (await load())?.code ?? null;
}

/** The server has had it: an authenticated request that carried it succeeded. */
export async function forgetReferral(): Promise<void> {
  held = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* Nothing to remove. */
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) void load();
  return () => listeners.delete(listener);
}

/** Whether a referral code is held — for "Invited by a friend" on sign-in. */
export function useHeldReferral(): string | null {
  return useSyncExternalStore(subscribe, () => live(held)?.code ?? null);
}
