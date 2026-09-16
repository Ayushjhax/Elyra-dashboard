import { NextResponse } from "next/server";
import { resolveCode } from "@/lib/referrals/codes";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  isWellFormedCode,
} from "@/lib/referrals/config";
import { readAttributionCookie } from "@/lib/referrals/attribution";

/* ---------------------------------------------------------------------------
   /r/{code} — the referral link.

   A route handler rather than a page: there is nothing to render. It
   validates, remembers, and redirects, which is one server round trip and no
   flash of an intermediate screen.

   The cookie is httpOnly, so the attribution cannot be read or forged by
   script on the page, and SameSite=Lax so it survives the redirect and the
   sign-in flow that follows without being attachable to a cross-site POST.

   FIRST TOUCH: an existing cookie is never overwritten. Someone who arrives
   through two different links stays with the first. That is checked here as
   well as at bind time, so the later link never even reaches the database.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const normalised = (code ?? "").trim().toUpperCase();
  const origin = new URL(request.url).origin;

  /* An invalid or unknown code lands on the app rather than an error page.
     The visitor did nothing wrong, and a broken link is not a reason to
     refuse someone entry to the product — they simply arrive unattributed. */
  if (!isWellFormedCode(normalised)) {
    return NextResponse.redirect(new URL("/", origin), 302);
  }

  const referrerUserId = await resolveCode(normalised);
  const response = NextResponse.redirect(
    new URL(referrerUserId === null ? "/" : "/?ref=1", origin),
    302,
  );

  if (referrerUserId === null) return response;

  /* First touch: leave an existing attribution alone. */
  if (readAttributionCookie(request) !== null) return response;

  response.cookies.set(ATTRIBUTION_COOKIE, normalised, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
  });

  return response;
}
