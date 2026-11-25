import "server-only";

import { NextResponse } from "next/server";
import { liveEnabled, tradingNetwork } from "@/lib/autotrade/store";
import { paperView } from "@/lib/paper/store";
import type { PaperResponse } from "@/lib/paper/types";

/* The account as /api/paper answers it, after a read or a write. */
export async function paperResponse(userId: string, status = 200): Promise<NextResponse<PaperResponse>> {
  const live = { enabled: liveEnabled(), network: tradingNetwork() };
  try {
    return NextResponse.json({ account: await paperView(userId), live, error: null }, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { account: null, live, error: error instanceof Error ? error.message : "The paper account could not be read." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
