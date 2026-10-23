/* ---------------------------------------------------------------------------
   What must happen when an account leaves this phone — signed out, or
   replaced by another sign-in.

   Each feature registers its own clean-up here rather than the auth layer
   knowing about every feature: the agent's conversation ends, the MWA
   wallet authorization is forgotten, and (Prompt 13) the push device is
   unregistered from the account that is leaving. The account stores reset
   themselves from lib/session.ts.

   A hook gets the key of the account that left, so it can act for that
   account — the push device, for one, must be removed from the account it
   was registered to, not the next one.
--------------------------------------------------------------------------- */

type Leaving = (previousAccount: string) => void | Promise<void>;

const hooks = new Set<Leaving>();

export function onAccountLeave(hook: Leaving): () => void {
  hooks.add(hook);
  return () => hooks.delete(hook);
}

/** Runs every hook. One failing does not stop the others. */
export async function accountLeft(previousAccount: string): Promise<void> {
  await Promise.all(
    [...hooks].map(async (hook) => {
      try {
        await hook(previousAccount);
      } catch (error) {
        console.warn("[auth] clean-up after sign-out failed", error instanceof Error ? error.message : error);
      }
    }),
  );
}
