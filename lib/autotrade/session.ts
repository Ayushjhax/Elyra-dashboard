import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { STRATEGIES } from "@/lib/backtest/strategies";
import type { StrategyRef } from "@/lib/autotrade/rules";
import type { StrategyOption } from "@/lib/autotrade/types";

/* The verified caller for an automation route; the user is the token's, never the body's. */
export async function automationUser(
  request: Request,
): Promise<{ response: NextResponse } | { userId: string; evmAddress: string | null }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) {
    return { response: NextResponse.json({ error: databaseUnavailableMessage("Automation") }, { status: 503 }) };
  }
  const evm = user.walletAddress !== null && /^0x[0-9a-fA-F]{40}$/.test(user.walletAddress) ? user.walletAddress : null;
  return { userId: user.userId, evmAddress: evm };
}

export const STRATEGY_REFS: StrategyRef[] = STRATEGIES.map((strategy) => ({
  id: strategy.id,
  parameters: strategy.parameters,
  intradayOnly: strategy.intradayOnly,
}));

export const STRATEGY_OPTIONS: StrategyOption[] = STRATEGIES.map((strategy) => ({
  id: strategy.id,
  name: strategy.name,
  category: strategy.category,
  rules: strategy.rules,
  parameters: strategy.parameters.map((parameter) => ({
    key: parameter.key,
    label: parameter.label,
    default: parameter.default,
    min: parameter.min,
    max: parameter.max,
    step: parameter.step,
    description: parameter.description,
  })),
  intradayOnly: strategy.intradayOnly === true,
}));
