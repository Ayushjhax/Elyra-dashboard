import "server-only";

import { NotFoundError } from "@privy-io/node";
import { PRIVY_TIMEOUT_MS, privyClient } from "@/lib/auth/privy";
import { forgetAddresses } from "@/lib/auth/session";
import { RESEARCH_BUCKET } from "@/lib/research/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Deleting an Elyra account — DELETE /api/account, from the app's Account
   tab.

   The account is shared by the website and the app, so this deletes it
   everywhere. Three things go, in this order:

     1. The stored report PDFs. They live in object storage, outside the
        database, under `<profile id>/`, so nothing cascades to them — and
        once the row is gone, so is the only record of whose they were.
     2. The profile row. Every table that holds the account's data
        references it `on delete cascade`: push devices, the inbox, alerts,
        conversations and messages, memory, reports, backtests, exchange
        connections (their encrypted keys with them), watchlists, referrals
        and points, prepared actions, preferences and the Telegram link.
        `agent_runs` is `on delete set null`: its rows — provider, latency,
        error, no content — stay as unattributed operational counts.
     3. The Privy user: the login, its linked accounts and the embedded
        wallet's key share. After this no session can sign in as it again.

   IDEMPOTENT. Each step treats "already gone" as done, so a retry after a
   failure part-way through finishes the job rather than erroring: the token
   stays verifiable until it expires (verification is local), the row may
   already be deleted, and Privy answers 404 for a user it no longer has.

   Nothing on chain is touched, because nothing here can: the wallet's
   history stays on Solana, and its funds stay at its address.
--------------------------------------------------------------------------- */

export type DeletionStep = "files" | "profile" | "privy";

export type DeletionResult =
  | { ok: true; profileDeleted: boolean; filesDeleted: number; privyDeleted: boolean }
  | { ok: false; step: DeletionStep; error: string };

/** Storage paths are listed a page at a time. */
const PAGE = 100;

/** Every stored object under the account's folder, or null when storage did not answer. */
async function storedFiles(userId: string): Promise<string[] | null> {
  const bucket = serviceClient().storage.from(RESEARCH_BUCKET);
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await bucket.list(userId, { limit: PAGE, offset });
    if (page.error) {
      /* A deployment that never created the bucket has stored nothing. */
      return /not.?found/i.test(page.error.message) ? paths : null;
    }
    for (const entry of page.data ?? []) paths.push(`${userId}/${entry.name}`);
    if ((page.data ?? []).length < PAGE) return paths;
  }
}

async function deleteFiles(userId: string): Promise<number | null> {
  const listed = await storedFiles(userId);
  if (listed === null) return null;

  /* Report rows name their own PDF; a path outside the folder (none should
     exist) is removed all the same. */
  const reports = await serviceClient()
    .from("research_reports")
    .select("pdf_path")
    .eq("user_id", userId);
  if (reports.error) return null;
  const named = (reports.data ?? [])
    .map((row) => (row as { pdf_path: string | null }).pdf_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  const paths = [...new Set([...listed, ...named])];
  if (paths.length === 0) return 0;

  const removed = await serviceClient().storage.from(RESEARCH_BUCKET).remove(paths);
  if (removed.error && !/not.?found/i.test(removed.error.message)) return null;
  return paths.length;
}

/** Deletes the account a verified Privy DID names, everywhere. */
export async function deleteAccount(privyDid: string): Promise<DeletionResult> {
  const db = serviceClient();

  const found = await db.from("profiles").select("id").eq("privy_did", privyDid).maybeSingle();
  if (found.error) return { ok: false, step: "profile", error: found.error.message };
  const userId = (found.data as { id: string } | null)?.id ?? null;

  let filesDeleted = 0;
  if (userId !== null) {
    const files = await deleteFiles(userId);
    if (files === null) return { ok: false, step: "files", error: "Stored reports could not be removed." };
    filesDeleted = files;

    const removed = await db.from("profiles").delete().eq("id", userId);
    if (removed.error) return { ok: false, step: "profile", error: removed.error.message };
  }

  let privyDeleted = true;
  try {
    await privyClient().users().delete(privyDid, { timeout: PRIVY_TIMEOUT_MS });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      privyDeleted = false;
    } else {
      return { ok: false, step: "privy", error: error instanceof Error ? error.message : String(error) };
    }
  }

  forgetAddresses(privyDid);
  return { ok: true, profileDeleted: userId !== null, filesDeleted, privyDeleted };
}
