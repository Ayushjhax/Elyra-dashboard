import { NextResponse } from "next/server";
import { leagueView, leaveLeague, makePick, moveMarket, startDraft } from "@/lib/arena/leagues";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* ---------------------------------------------------------------------------
   One league, for its managers only.

   GET   the draft board, rosters, this round's live scores, the schedule,
         the table and the recaps.
   POST  { action: "start" }                 the owner starts the draft
         { action: "pick", market }          the manager on the clock picks
         { action: "move", drop, add }       a free-agent move, next round
         { action: "leave" }                 before the draft; the owner's
                                             leaving closes the league
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "No such league." }, { status: 404 });

export async function GET(request: Request, context: Context): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();
  try {
    return NextResponse.json({ league: await leagueView(resolved.userId, id, Date.now()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return arenaFailure(error);
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();
  try {
    const body = await jsonBody(request);
    const now = Date.now();
    switch (body.action) {
      case "start":
        await startDraft(resolved.userId, id, now);
        break;
      case "pick":
        await makePick(resolved.userId, id, body, now);
        break;
      case "move":
        await moveMarket(resolved.userId, id, body, now);
        break;
      case "leave":
        return NextResponse.json({ ok: true, left: await leaveLeague(resolved.userId, id) });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ league: await leagueView(resolved.userId, id, now) });
  } catch (error) {
    return arenaFailure(error);
  }
}
