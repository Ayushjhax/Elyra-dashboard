import { TelegramMiniApp } from "@/components/telegram/MiniApp";

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

export const metadata = {
  title: "Elyra",
  description: "Your capital, in Telegram.",
};

export default function TelegramPage() {
  return <TelegramMiniApp />;
}
