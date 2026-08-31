import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { required } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/* ===========================================================================
   !! READ THIS BEFORE WRITING A QUERY AGAINST THIS CLIENT !!

   This client uses the service role key. It bypasses RLS completely. Every
   row in the database is visible to it, for every user.

   Authentication is Privy, not Supabase Auth, so `auth.uid()` is null and the
   policies in the migration match nothing. There is no second line of defence
   behind this client. Row scoping is entirely the caller's job:

     - Every query MUST filter by `user_id` in the query itself.
     - That `user_id` MUST come from a verified identity:
         · web      — a Privy access token verified in lib/auth/session.ts
         · telegram — `message.from.id` looked up in `telegram_links`
     - NEVER take a user identifier from request body, message text, callback
       payload, or any other caller-supplied field. On the Telegram surface in
       particular, `message.from.id` is asserted by Telegram; anything inside
       the message text is asserted by a stranger.

   `import "server-only"` above makes importing this from a client component a
   build error rather than a leaked key.
   =========================================================================== */

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/** The service-role client. Read the block above before using it. */
export function serviceClient(): Db {
  if (cached) return cached;

  cached = createClient<Database>(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        /* No user session is ever attached to this client, and nothing should
           persist one. It is a server singleton, not a per-request identity. */
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return cached;
}
