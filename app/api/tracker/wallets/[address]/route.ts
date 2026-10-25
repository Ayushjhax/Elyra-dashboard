import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceUrl } from "@/lib/services";

const TRACKER_URL = serviceUrl(process.env.SMART_MONEY_TRACKER_URL, "http://localhost:8790");
const querySchema = z.object({ source: z.enum(["hyperliquid", "birdeye-solana"]) });
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }): Promise<NextResponse> {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "source is required" }, { status: 400 });
  if (TRACKER_URL === null) return NextResponse.json({ error: "tracker not configured" }, { status: 503 });
  const { address } = await context.params;
  try {
    const response = await fetch(new URL(`/wallets/${encodeURIComponent(address)}?source=${parsed.data.source}`, TRACKER_URL), { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    return NextResponse.json(await response.json() as unknown, { status: response.status });
  } catch { return NextResponse.json({ error: "tracker unavailable" }, { status: 503 }); }
}
