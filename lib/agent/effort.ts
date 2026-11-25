import "server-only";

import { optional } from "@/lib/env";
import type { Effort } from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   How hard Claude thinks for each step of a reply.

   Claude Sonnet 5 runs at `high` effort unless told otherwise, and the
   thinking that effort buys is most of the wait before a reply starts. Not
   every step needs it: Strategy's and Execution's reviews read notes and
   use no tools, a spoken reply is short by design, and a Desk seat writes
   one short answer from one fact sheet, so those run `low`; Research's tool
   use, the single agent and the orchestrator's written reply run `medium`.

   Chosen for speed and not yet held to an eval of answer quality. One switch
   undoes it without a deploy: `ANTHROPIC_EFFORT=model` leaves every step at
   the model's own default (the behaviour before this), and `low`, `medium`
   or `high` puts every step at that level.
--------------------------------------------------------------------------- */

export type AgentStep = "answer" | "research" | "review" | "write" | "voice" | "desk";

export const FAST: Readonly<Record<AgentStep, Effort>> = {
  answer: "medium",
  research: "medium",
  review: "low",
  write: "medium",
  voice: "low",
  /* A Desk seat reads one fact sheet and writes a short answer (lib/desk). */
  desk: "low",
};

/** The effort for a step under a setting; undefined means the model's default. */
export function effortFor(step: AgentStep, setting: string | undefined = optional("ANTHROPIC_EFFORT")): Effort | undefined {
  const value = setting?.trim().toLowerCase();
  if (value === "model") return undefined;
  if (value === "low" || value === "medium" || value === "high") return value;
  return FAST[step];
}
