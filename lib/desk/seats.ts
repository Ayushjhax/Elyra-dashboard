import "server-only";

import { anthropicProvider } from "@/lib/agent/providers/anthropic";
import { cohereProvider } from "@/lib/agent/providers/cohere";
import { geminiProvider } from "@/lib/agent/providers/gemini";
import { openAICompatibleProvider } from "@/lib/agent/providers/openaiCompatible";
import type { Provider } from "@/lib/agent/providers/types";
import { SEATS, type SeatDef } from "@/lib/desk/roster";
import type { DeskSeatView } from "@/lib/desk/types";
import { optional, type OptionalKey } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Which seats this deployment fills, and the provider that answers for each.
   A seat is filled when its key is set and it has a model (its default, or
   its `modelEnv`). Keys never leave the server; the page learns only which
   seats are filled and with which model.
--------------------------------------------------------------------------- */

const read = (name: string): string | undefined => optional(name as OptionalKey);

export function modelFor(seat: SeatDef): string | null {
  return read(seat.modelEnv) ?? seat.defaultModel;
}

export function isSeated(seat: SeatDef): boolean {
  return read(seat.keyEnv) !== undefined && modelFor(seat) !== null;
}

export function seatedSeats(): SeatDef[] {
  return SEATS.filter(isSeated);
}

export function seatViews(): DeskSeatView[] {
  return SEATS.map((seat) => {
    const seated = isSeated(seat);
    return {
      id: seat.id,
      title: seat.title,
      lens: seat.lens,
      lab: seat.lab,
      model: seated ? modelFor(seat) : null,
      tier: seat.tier,
      votes: seat.votes,
      seated,
    };
  });
}

/** The provider for a filled seat. Throws for an empty one — callers ask only seated seats. */
export function providerFor(seat: SeatDef): Provider {
  const model = modelFor(seat);
  const key = read(seat.keyEnv);
  if (model === null || key === undefined) throw new Error(`The ${seat.title} seat is empty.`);
  switch (seat.provider) {
    case "anthropic":
      return anthropicProvider(model);
    case "gemini":
      return geminiProvider(model);
    case "cohere":
      return cohereProvider(model, key);
    case "openai_compatible":
      return openAICompatibleProvider({
        baseUrl: seat.baseUrl as string,
        apiKey: key,
        model,
        /* OpenRouter's optional attribution; names the app, nothing about anyone in it. */
        headers: seat.baseUrl?.includes("openrouter.ai") ? { "X-Title": "Elyra" } : undefined,
      });
  }
}
