import "server-only";

import { settleDesk, type DeskSettleReport } from "@/lib/desk/engine";
import { recipientFor, send, type DeliveryReport, type Recipient } from "@/lib/notifications/deliver";

/* The Desk's part of the five-minute tick: settle runs that came due, score every forecast, tell the person who convened. */
export async function runDeskTick(now: number = Date.now()): Promise<DeskSettleReport> {
  const recipients = new Map<string, Promise<Recipient>>();
  const delivery: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  const notes: string[] = [];
  const report = await settleDesk(now, async (userId, title, lines) => {
    try {
      if (!recipients.has(userId)) recipients.set(userId, recipientFor(userId));
      const recipient = await (recipients.get(userId) as Promise<Recipient>);
      await send(
        recipient,
        { inbox: true, push: recipient.devices.some((device) => device.disabled_at === null), telegram: recipient.chatId !== null },
        { kind: "system", title, lines, route: "/desk" },
        delivery,
      );
    } catch {
      notes.push(`could not notify ${userId}`);
    }
  });
  return { ...report, notes: [...report.notes, ...notes] };
}
