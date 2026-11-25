import { parseShortcut, type ShortcutEntry, type ShortcutScreen } from "@/lib/agent/shortcuts";

/* ---------------------------------------------------------------------------
   The composer's slash commands on the website. Pure.

   The shortcuts are shared with the Android app (lib/agent/shortcuts.ts),
   which opens its own screens. On the website a shortcut becomes one of
   three things: a question the agent answers ("/analyze SOL", "/macro"),
   the page that already shows the thing ("/portfolio"), or the list of
   shortcuts. Anything the website has no page for is asked as it was
   typed, without the slash — the agent understands "swap 1 SOL to USDC" and
   prepares it for review.
--------------------------------------------------------------------------- */

export type WebShortcut = { kind: "ask"; prompt: string } | { kind: "open"; href: string } | { kind: "help" };

const SCREEN_HREF: Partial<Record<ShortcutScreen, string>> = {
  portfolio: "/portfolio",
  wallet: "/assets",
  risk: "/portfolio",
  defi: "/portfolio",
  markets: "/markets",
  orders: "/automation",
  fills: "/automation",
  automation: "/automation",
};

/** What a line typed into the website's composer does; null when it is not a shortcut. */
export function webShortcut(raw: string): WebShortcut | null {
  const text = raw.trim();
  if (!/^\/[a-z]/i.test(text)) return null;
  const plain = text.replace(/^\/(\S+)/, "$1");
  const shortcut = parseShortcut(text);
  switch (shortcut.kind) {
    case "ask":
      /* An unrecognised command is asked as typed, minus its slash. */
      return { kind: "ask", prompt: shortcut.prompt === text ? plain : shortcut.prompt };
    case "help":
      return { kind: "help" };
    case "open": {
      const href = SCREEN_HREF[shortcut.screen];
      return href === undefined ? { kind: "ask", prompt: plain } : { kind: "open", href };
    }
    case "research":
      return { kind: "open", href: "/research" };
    case "asset":
      return { kind: "ask", prompt: `What is ${shortcut.symbol}'s price right now, and how has it moved today?` };
    case "report":
      return { kind: "ask", prompt: `Write me a sourced report on ${shortcut.symbol}: ${shortcut.query}.` };
    default:
      return { kind: "ask", prompt: plain };
  }
}

/** The website asks questions first: the analysis shortcuts lead its menu, then the rest in their shared order. */
const WEB_FIRST = ["analyze", "research", "safe", "sentiment", "compare", "macro", "deep"];

export function webShortcutMenu(entries: readonly ShortcutEntry[]): ShortcutEntry[] {
  const rank = (entry: ShortcutEntry) => {
    const index = WEB_FIRST.indexOf(entry.command);
    return index === -1 ? WEB_FIRST.length : index;
  };
  return [...entries].sort((a, b) => rank(a) - rank(b));
}
