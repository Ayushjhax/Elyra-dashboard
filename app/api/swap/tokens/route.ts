import { NextResponse } from "next/server";
import { stockListing } from "@/lib/sunrise/listing";
import { catalogue } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   What can be swapped.

   Served rather than duplicated in the client. The allowlist in
   `lib/telegram/trade.ts` is the one place a symbol becomes tradable, and a
   second copy in a component is how the dialog ends up offering a token the
   quote step will refuse — or worse, keeps offering one that was removed
   because its market went bad.

   Symbols only. The mints stay on the server: the browser never needs them,
   and a mint in client code is a mint someone can edit in a debugger.

   `?include=sunrise` adds the tokenized stocks Sunrise lists, as a group
   marked `eligibility: "sunrise"` — a trade of one asks the person to
   confirm they are eligible (lib/sunrise/eligibility.ts). Only a client
   that can ask that question requests them: the website's swap dialog. The
   Android app's request is unchanged. A Sunrise symbol that is also on the
   allowlist, or that two of its tokens share, is left out — the quote step
   could not tell which one was meant. Without Sunrise's key the group is
   the same issuer's tokens from Jupiter's index (lib/sunrise/listing.ts),
   under the same eligibility marker.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";

interface Group {
  label: string;
  symbols: string[];
  eligibility?: "sunrise";
}

export async function GET(request: Request) {
  const groups: Group[] = catalogue();
  if (new URL(request.url).searchParams.get("include") === "sunrise") {
    const listed = await stockListing();
    if (listed.ok) {
      const taken = new Set(groups.flatMap((group) => group.symbols.map((symbol) => symbol.toUpperCase())));
      const counts = new Map<string, number>();
      for (const token of listed.data) counts.set(token.symbol.toUpperCase(), (counts.get(token.symbol.toUpperCase()) ?? 0) + 1);
      const symbols = listed.data
        .map((token) => token.symbol)
        .filter((symbol) => !taken.has(symbol.toUpperCase()) && counts.get(symbol.toUpperCase()) === 1)
        .sort((a, b) => a.localeCompare(b));
      const label = listed.source === "sunrise" ? "Tokenized stocks (Sunrise)" : "Tokenized stocks (Backpack)";
      if (symbols.length > 0) groups.push({ label, symbols, eligibility: "sunrise" });
    }
  }
  return NextResponse.json({ groups });
}
