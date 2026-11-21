import "server-only";

import type { ToolContext } from "@/lib/agent/tools/registry";
import { describeAttachments, type Attachment } from "@/lib/attachments";
import { predictionAccount } from "@/lib/prediction/account";
import type { Locale } from "@/lib/i18n/locales";
import type { VoicePersonaId } from "@/lib/voice/personas";

/* ---------------------------------------------------------------------------
   What every run of a question shares, whoever answers it — `runAgent` on
   its own or `runTeam` with several members: who is asking, how the question
   is stored, and what a failed run says.
--------------------------------------------------------------------------- */

/**
 * What a run knows about who is asking. Resolved here, never from a request
 * body or model output.
 */
export async function toolContextFor(input: {
  userId: string;
  message: string;
  sessionWallet?: string | null;
  solanaAddress?: string | null;
  locale?: Locale;
  voice?: VoicePersonaId;
}): Promise<ToolContext> {
  return {
    userId: input.userId,
    sessionWallet: input.sessionWallet ?? null,
    solanaAddress: input.solanaAddress ?? null,
    /* Resolved from the profile rather than passed in: it is an identity,
       and identities do not travel through request bodies here. */
    polymarketAddress: (await predictionAccount(input.userId))?.address ?? null,
    /* The operator's words this turn, which the tools that change anything
       are held to. Never the model's text, and never a tool result's. */
    operatorMessage: input.message,
    locale: input.locale,
    voice: input.voice,
  };
}

/** The question as stored: the files are not, only that they were sent. */
export function storedQuestion(message: string, attachments: readonly Attachment[]): string {
  /* A later turn then knows something was attached and does not pretend to
     still see it. */
  const noted = describeAttachments([...attachments]);
  return noted.length === 0 ? message : `${message}\n\n${noted}`.trim();
}

/** The reply for a run that failed, by what failed. */
export function failureReply(failure: string, hadAttachments: boolean): string {
  /* A 400 on a turn with files is almost always the file: too many PDF
     pages, an image too large. Saying so is the difference between the
     person fixing it and retrying the same thing. */
  return hadAttachments && failure.startsWith("bad_request")
    ? "The model could not read that attachment. PDFs can be up to 100 pages " +
        "and images up to 8000 pixels on a side. Nothing was changed."
    : "Something went wrong reaching the model, so I have no answer for that " +
        "one. Nothing was changed.";
}

/** The reply for a run the budget stopped before the model answered. */
export const RAN_LONG_REPLY =
  "I ran out of time working through that one and stopped before " +
  "finishing. Ask again, or narrow it to a single symbol.";
