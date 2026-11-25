import "server-only";

import { getSessionUser, hasProfile } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   Who is asking, for /api/copy. The leaderboard is public: signed out, the
   viewer is null and sees only shared sets. A write needs a session; the
   user is always the token's, never the body's — `automationUser` for those.
--------------------------------------------------------------------------- */

export async function viewerOf(request: Request): Promise<string | null> {
  const user = await getSessionUser(request).catch(() => null);
  return user !== null && hasProfile(user) ? user.userId : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
