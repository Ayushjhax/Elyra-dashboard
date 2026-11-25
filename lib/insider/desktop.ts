"use client";

/* ---------------------------------------------------------------------------
   Desktop notices for insider watch — the browser's own notification, while
   Elyra is open in a tab. Off until the person turns it on in this browser
   and the browser grants permission; asked for only from that button.

   Only what arrives while the page is open is announced: the first read in
   a tab is taken as already known (it is in the bell, unread), so opening
   Elyra never fires a burst of old notices. Each notice is tagged with the
   wallet, so two open tabs show it once. The choice is this browser's, kept
   in localStorage: a convenience, never the record — the bell is that.
--------------------------------------------------------------------------- */

const KEY = "elyra.insider.desktop";

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: told when this tab turns notices on or off. */
export function subscribeDesktop(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed(): void {
  for (const listener of listeners) listener();
}

export type DesktopState = "unsupported" | "denied" | "off" | "on";

export function desktopState(): DesktopState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  let wanted = false;
  try {
    wanted = window.localStorage.getItem(KEY) === "1";
  } catch {
    wanted = false;
  }
  return wanted && Notification.permission === "granted" ? "on" : "off";
}

export async function enableDesktop(): Promise<DesktopState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    changed();
    return permission === "denied" ? "denied" : "off";
  }
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* Storage blocked: the notices stay off, and the button says so. */
    return "off";
  }
  changed();
  return "on";
}

export function disableDesktop(): DesktopState {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* Nothing to undo. */
  }
  changed();
  return desktopState();
}

let seenFor: string | null | undefined;
let seen = new Set<string>();

/** Raises a notice for each item this tab has not seen since its first read. */
export function announce(account: string | null, items: ReadonlyArray<{ id: string; title: string; body: string; href: string }>): void {
  if (account !== seenFor) {
    seenFor = account;
    seen = new Set(items.map((item) => item.id));
    return;
  }
  const fresh = items.filter((item) => !seen.has(item.id));
  for (const item of fresh) seen.add(item.id);
  if (fresh.length === 0 || desktopState() !== "on") return;
  for (const item of fresh) {
    try {
      const notice = new Notification(item.title, { body: item.body, tag: item.id });
      notice.onclick = () => {
        window.focus();
        window.location.assign(item.href);
        notice.close();
      };
    } catch {
      /* Some browsers only allow notices from a service worker; the bell still has it. */
    }
  }
}
