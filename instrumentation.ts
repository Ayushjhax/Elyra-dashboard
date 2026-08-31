/**
 * Startup check.
 *
 * Next calls `register` once per server process, before the first request is
 * routed. Validating here means a missing key is a boot failure with every
 * missing name listed, rather than a 500 on whichever request happens to
 * touch the feature first.
 *
 * The edge runtime gets no check: it has a different environment, and nothing
 * in this app runs there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertServerEnv, EnvError } = await import("@/lib/env");

  try {
    assertServerEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      /* Fail loudly and specifically. In development, throwing would be
         swallowed into an overlay on one route; the explicit log is what the
         operator actually sees. */
      console.error(`\n[elyra] ${error.message}\n`);
    }
    throw error;
  }
}
