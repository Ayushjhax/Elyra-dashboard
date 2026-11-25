/* ---------------------------------------------------------------------------
   Runs work for one key at a time on this instance: each call waits for the
   one before it under the same key, whether that one succeeded or threw.

   Used where two requests arriving together must not both read the same
   state and both pass a limit — an agent key's daily cap (lib/rails), a
   fund's exposure (lib/funds). It holds within one server instance only;
   the database's own unique keys are what hold across instances.
--------------------------------------------------------------------------- */

const queues = new Map<string, Promise<unknown>>();

export function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => undefined);
  return next;
}
