import "server-only";
import { storePreparedAction } from "@/lib/actions/store";
import type { PreparedActionSurface } from "@/lib/actions/types";
import { prepareAction } from "@/lib/personalized/actions";
import { inferProposal } from "@/lib/personalized/proposal";
import type { PersonalizedContext, PreparedAction } from "@/lib/personalized/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   A request to move capital, as a server-built preview.

   The model's prose is kept; its proposed numbers are not. The proposal is
   derived from the question and resolved against the live snapshot by
   `prepareAction`, which re-reads every balance — nothing a model wrote
   reaches the preview as a value.

   A ready preview is stored, so a review card can finish it and the
   confirmation can be recorded against it once a wallet signs. A preview
   that is not ready is returned with its reason and never stored — a card
   offering what nothing can execute is a promise the product cannot keep.

   Shared by Personalized and Ask Elyra, so both prepare the same action
   from the same question.
--------------------------------------------------------------------------- */

export async function planPreparedAction(input: {
  message: string;
  symbols: string[];
  snapshot: PortfolioSnapshot;
  memories: PersonalizedContext["memories"];
  userId: string | null;
  surface: PreparedActionSurface;
}): Promise<{ action: PreparedAction; id: string | null } | null> {
  const proposal = inferProposal(input.message, input.symbols);
  if (proposal === null) return null;
  const limit = input.memories.find((memory) => memory.type === "concentration_limit");
  const action = prepareAction(proposal, input.snapshot, {
    concentrationLimit: typeof limit?.value === "number" ? limit.value : null,
  });
  const stored =
    action.readiness === "ready" && input.userId !== null
      ? await storePreparedAction({ userId: input.userId, action, surface: input.surface })
      : null;
  return { action, id: stored?.id ?? null };
}
