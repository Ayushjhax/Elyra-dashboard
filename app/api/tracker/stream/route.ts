import { NextResponse } from "next/server";

const TRACKER_URL = process.env.SMART_MONEY_TRACKER_URL ?? "http://localhost:8790";
export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   The tracker's live signal stream, proxied.

   The timeout here is a CONNECT timeout, and it has to be written by hand.

   `AbortSignal.timeout(5_000)` cannot express it: that signal fires five
   seconds after the request starts and aborts everything attached to it,
   body included. Against an endpoint that answers quickly and closes, the
   difference never shows. Against Server-Sent Events — which are designed to
   stay open indefinitely and heartbeat every fifteen seconds — it aborted
   every connection at the five-second mark, and the route answered 500 after
   exactly 5.0s, every time.

   So the timer is cleared the moment the response headers arrive. Up to that
   point it guards against a tracker that accepts a socket and never replies;
   after it, the body is allowed to run for as long as the client wants it.

   The abort is then re-armed against the client instead: when the browser
   closes the EventSource, `request.signal` fires and the upstream connection
   is torn down with it. Without that, every reload would leave a live socket
   against the tracker with nothing reading it.
--------------------------------------------------------------------------- */

/** Long enough for a cold Fastify route, short enough to fail a dead host. */
const CONNECT_TIMEOUT_MS = 5_000;

export async function GET(request: Request): Promise<Response> {
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  /* A client that goes away before the upstream answers must not leave this
     request hanging either, so both are wired to the same controller. */
  const onClientGone = () => controller.abort();
  request.signal.addEventListener("abort", onClientGone);

  try {
    const upstream = await fetch(new URL("/stream", TRACKER_URL), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        /* Forwarded so the tracker can replay from where this client left
           off rather than resending its whole snapshot on every reconnect. */
        ...(request.headers.get("last-event-id") !== null
          ? { "last-event-id": request.headers.get("last-event-id") as string }
          : {}),
      },
    });

    /* Connected. From here the stream may run as long as it likes. */
    clearTimeout(connectTimer);

    if (!upstream.ok || upstream.body === null) {
      request.signal.removeEventListener("abort", onClientGone);
      return NextResponse.json(
        { error: `tracker stream returned ${upstream.status}` },
        { status: 503 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        /* Nginx and friends buffer proxied responses by default, which holds
           every event until the buffer fills — for a heartbeat stream, that
           is indistinguishable from the tracker being down. */
        "x-accel-buffering": "no",
      },
    });
  } catch (error: unknown) {
    clearTimeout(connectTimer);
    request.signal.removeEventListener("abort", onClientGone);

    /* The client navigating away aborts this too, and that is not a failure
       worth logging or reporting — there is no longer anyone to report it
       to. 499 is nginx's code for it and never reaches a browser. */
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? `tracker did not answer within ${CONNECT_TIMEOUT_MS}ms`
            : "tracker stream unavailable",
      },
      { status: 503 },
    );
  }
}
