import type { Metadata } from "next";
import { TelegramMiniApp } from "@/components/telegram/MiniApp";
import { getTranslator } from "@/lib/i18n/server";

/* ---------------------------------------------------------------------------
   The Telegram Mini App.

   Rendered with no Elyra shell — see STANDALONE_ROUTES in lib/layout.ts. The
   webview is about 380px wide and Telegram draws its own header and back
   button; a rail, a palette and a chart there are a second navigation
   fighting the first for a screen with room for neither.

   It is the SAME data as the dashboard, read through the same semantic tools,
   in a layout built for a phone held in one hand.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: "Elyra", description: t("Your capital, in Telegram.") };
}

export default function TelegramPage() {
  return <TelegramMiniApp />;
}
