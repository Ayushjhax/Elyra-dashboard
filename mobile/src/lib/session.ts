/* ---------------------------------------------------------------------------
   Who is signed in, as every account store sees it.

   One key (accountKey from lib/account.ts: the Privy account, or null while
   signed out). Every store subscribes; when the key changes — signed out, or
   signed in as someone else — each one resets and drops any read still in
   flight for the previous account, so one person's data never lands under
   the next person's name.

   Prompt 7 sets the key from Privy. Until then nobody is signed in and no
   store reads anything.
--------------------------------------------------------------------------- */

type Listener = (key: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function currentAccount(): string | null {
  return current;
}

export function setAccount(key: string | null): void {
  if (key === current) return;
  current = key;
  for (const listener of [...listeners]) listener(key);
}

export function onAccountChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
