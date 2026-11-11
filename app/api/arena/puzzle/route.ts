import { NextResponse } from "next/server";
import { utcDate } from "@/lib/arena/puzzle";
import { answerPuzzle } from "@/lib/arena/server";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* Answers today's puzzle — once. The answer, rating and reveal come back together. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    return NextResponse.json({ puzzle: await answerPuzzle(resolved.userId, utcDate(Date.now()), await jsonBody(request)) });
  } catch (error) {
    return arenaFailure(error);
  }
}
