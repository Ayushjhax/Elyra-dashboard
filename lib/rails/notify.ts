import "server-only";

import { recipientFor, send, type DeliveryReport } from "@/lib/notifications/deliver";

/* ---------------------------------------------------------------------------
   Telling the person that an agent asked for something, or that a payment
   arrived — through `send`, to the inbox, push and a linked Telegram chat,
   like a trade notice. Best effort: a notice that cannot be delivered never
   holds up the intent it is about, which waits in Elyra → Agents either way.

   Lines are Elyra's own words. An agent's stated reason is never put in a
   notice: it is text an agent wrote, and it is shown only in the console,
   as text, labelled as the agent's.
--------------------------------------------------------------------------- */

export async function notifyOwner(userId: string, title: string, lines: string[], route = "/agents"): Promise<void> {
  try {
    const recipient = await recipientFor(userId);
    const report: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
    await send(
      recipient,
      { inbox: true, push: recipient.devices.some((device) => device.disabled_at === null), telegram: recipient.chatId !== null },
      { kind: "system", title, lines, route },
      report,
    );
  } catch {
    /* The console shows it regardless. */
  }
}
