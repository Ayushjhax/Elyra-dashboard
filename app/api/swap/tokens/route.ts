import { NextResponse } from "next/server";
import { catalogue } from "@/lib/telegram/trade";

/* ---------------------------------------------------------------------------
   What can be swapped.

   Served rather than duplicated in the client. The allowlist in
   `lib/telegram/trade.ts` is the one place a symbol becomes tradable, and a
   second copy in a component is how the dialog ends up offering a token the
   quote step will refuse — or worse, keeps offering one that was removed
   because its market went bad.

   Symbols only. The mints stay on the server: the browser never needs them,
   and a mint in client code is a mint someone can edit in a debugger.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ groups: catalogue() });
}
