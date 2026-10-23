import { router, type Href } from "expo-router";
import type { Shortcut, ShortcutScreen } from "@/lib/agent/shortcuts";
import type { ReportRecord } from "@/lib/research/reportTypes";
import { appendExchange, sendToAgent } from "~/lib/agentChat";
import { api, ApiError } from "~/lib/api";
import { useAppStore } from "~/lib/store";

/* ---------------------------------------------------------------------------
   Carrying out a shortcut (lib/agent/shortcuts.ts decides what one means).

   A shortcut opens the screen that already shows the thing, prefilled where
   it can be; nothing here signs, trades or sets anything without that
   screen's own confirmation. A report is started, and followed in the
   conversation. Anything else is asked as a question.
--------------------------------------------------------------------------- */

const ROUTES: Record<Exclude<ShortcutScreen, "signals">, Href> = {
  portfolio: "/portfolio",
  wallet: "/wallet",
  risk: "/risk",
  defi: "/defi",
  markets: "/",
  orders: "/orders",
  fills: "/fills",
  notifications: "/notifications",
  settings: "/account",
};

export interface ShortcutEffects {
  /** Watchlist edits go through the shared watchlist store. */
  watch: (op: "add" | "remove", symbol: string) => Promise<string | null>;
  /** A short confirmation or failure, shown as a toast. */
  say: (text: string, tone?: "neutral" | "positive" | "negative") => void;
  /** Lists the shortcuts in the composer. */
  showHelp: () => void;
}

/** Starts a company report and adds it to the conversation, to be followed there. */
async function startReport(typed: string, symbol: string, query: string): Promise<void> {
  try {
    const started = await api.post<Pick<ReportRecord, "id" | "status">>("/api/research/reports", { query });
    appendExchange(typed, {
      text: `Started a research report on ${symbol}, from its latest SEC filings. It takes a minute or two — it will finish here, and you can leave this screen.`,
      report: { id: started.id, query },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      /* Not a company with SEC filings — a token, say. The agent writes
         the short report instead. */
      void sendToAgent(`Write me a short report on ${symbol}.`);
      return;
    }
    appendExchange(typed, {
      text: error instanceof ApiError ? error.message : "The report could not be started. Check your connection.",
      failed: true,
    });
  }
}

/** Does what a shortcut says. `typed` is the line as sent. */
export async function runShortcut(shortcut: Shortcut, typed: string, effects: ShortcutEffects): Promise<void> {
  const store = useAppStore.getState();
  const clear = () => store.setComposerDraft("");
  switch (shortcut.kind) {
    case "ask":
      await sendToAgent(shortcut.prompt);
      return;
    case "help":
      effects.showHelp();
      return;
    case "open":
      clear();
      if (shortcut.screen === "signals") store.setAgentTab("signals");
      else router.push(ROUTES[shortcut.screen]);
      return;
    case "asset":
      clear();
      router.push({ pathname: "/asset/[symbol]", params: { symbol: shortcut.symbol } });
      return;
    case "swap": {
      clear();
      const params: Record<string, string> = {};
      if (shortcut.from !== null) params.from = shortcut.from;
      if (shortcut.to !== null) params.to = shortcut.to;
      if (shortcut.amount !== null) params.amount = shortcut.amount;
      router.push({ pathname: "/swap", params });
      return;
    }
    case "alert":
      clear();
      router.push({
        pathname: "/asset/[symbol]",
        params: {
          symbol: shortcut.symbol,
          alert: shortcut.direction ?? "above",
          ...(shortcut.target !== null ? { target: shortcut.target } : {}),
        },
      });
      return;
    case "watch": {
      clear();
      const failure = await effects.watch(shortcut.op, shortcut.symbol);
      effects.say(
        failure ?? (shortcut.op === "add" ? `Added ${shortcut.symbol} to your watchlist` : `Removed ${shortcut.symbol} from your watchlist`),
        failure === null ? "positive" : "negative",
      );
      return;
    }
    case "report":
      clear();
      await startReport(typed, shortcut.symbol, shortcut.query);
      return;
  }
}
