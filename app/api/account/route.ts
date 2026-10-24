import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/auth/deletion";
import { verifiedPrivyDid } from "@/lib/auth/session";
import { jsonBody } from "@/lib/notifications/session";

/* ---------------------------------------------------------------------------
   DELETE /api/account — deletes the caller's Elyra account, everywhere.

   The account is the one the token names and no other; the body only
   confirms intent, `{ "confirm": "DELETE" }`, the word the person typed, so
   a stray call cannot delete anything. What goes and what stays is in
   lib/auth/deletion.ts.

   Idempotent: calling it again for an account that is already gone answers
   200 with nothing left to delete, so a retry after a dropped connection
   is safe.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request): Promise<Response> {
  const privyDid = await verifiedPrivyDid(request);
  if (privyDid === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await jsonBody(request);
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Confirm with { "confirm": "DELETE" }.' }, { status: 400 });
  }

  const result = await deleteAccount(privyDid);
  if (!result.ok) {
    console.error(`[account] deletion stopped at ${result.step}: ${result.error}`);
    /* Every step is safe to retry, so each answer says to. */
    const said =
      result.step === "privy"
        ? "Your data was deleted, but the sign-in record could not be removed yet. Try again."
        : result.step === "files"
          ? "Your account could not be deleted. Nothing was removed. Try again."
          : "Your account could not be deleted. Try again.";
    return NextResponse.json({ error: said, step: result.step }, { status: 502 });
  }

  return NextResponse.json({
    deleted: true,
    profileDeleted: result.profileDeleted,
    filesDeleted: result.filesDeleted,
    privyDeleted: result.privyDeleted,
  });
}
