import { cookies, headers } from "next/headers";
import { devLogStore } from "./store";
import { SESSION_COOKIE, SESSION_HEADER } from "./domain/session";

export const dynamic = "force-dynamic";

type GuardFn = (
  request: Request
) => Response | null | undefined | void | Promise<Response | null | undefined | void>;

/**
 * Returns a Next.js Route Handler GET function for the SSE stream.
 * Use the guard option to add authentication or any other access control:
 *
 *   export const dynamic = "force-dynamic"
 *   export const GET = createDevPanelRoute({
 *     guard: (request) => {
 *       const token = request.headers.get("authorization")
 *       if (!isValidToken(token)) return new Response("Forbidden", { status: 403 })
 *     },
 *   })
 *
 * For simple use with no access control:
 *   export { dynamic, GET } from "@/server-network-panel/route"
 */
export function createDevPanelRoute(options?: { guard?: GuardFn; enabled?: boolean }) {
  return async function GET(request: Request) {
    if (options?.enabled === false) return new Response(null, { status: 404 });

    const blocked = await options?.guard?.(request);
    if (blocked instanceof Response) return blocked;

    // Header set by middleware; cookie fallback covers SSE routes excluded from the matcher.
    // Null guard prevents null === null matching across sessions when neither is available.
    const sessionId =
      (await headers()).get(SESSION_HEADER) ?? (await cookies()).get(SESSION_COOKIE)?.value ?? null;

    // On reconnect the browser sends Last-Event-ID with the last received entry id.
    // Use it to replay only entries the client hasn't seen yet.
    const lastEventId = request.headers.get("last-event-id");

    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const encodeEntry = (entry: { id: string }) =>
          encoder.encode(`id: ${entry.id}\ndata: ${JSON.stringify(entry)}\n\n`);

        // Sent immediately so proxies with a first-byte timeout (e.g. Varnish) don't
        // close the connection before the first real data or heartbeat arrives.
        controller.enqueue(encoder.encode(": connected\n\n"));

        const buffer = devLogStore.getBuffer();
        let lastSeenIndex = -1;
        if (lastEventId) {
          for (let i = buffer.length - 1; i >= 0; i--) {
            if (buffer[i].id === lastEventId) {
              lastSeenIndex = i;
              break;
            }
          }
        }

        for (let i = lastSeenIndex + 1; i < buffer.length; i++) {
          const entry = buffer[i];
          if (sessionId && entry.sessionId === sessionId) controller.enqueue(encodeEntry(entry));
        }

        // SSE comment sent every 8 s — keeps proxies and load balancers from closing
        // idle connections. 8 s is below common proxy idle timeouts (~10 s for Varnish).
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            /* closed */
          }
        }, 8_000);

        unsubscribe = devLogStore.subscribe((entry) => {
          if (!sessionId || entry.sessionId !== sessionId) return;
          try {
            controller.enqueue(encodeEntry(entry));
          } catch {
            // client disconnected mid-write; cancel handles cleanup
          }
        });
      },
      cancel() {
        clearInterval(heartbeat);
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };
}

// Default export for the simple plug-and-play case.
export const GET = createDevPanelRoute();

/**
 * Returns a Next.js Route Handler GET function that responds with a JSON
 * snapshot of the current server-side log buffer for the caller's session.
 * Useful for test automation — call it in teardown to collect network logs
 * as CI artifacts.
 *
 *   // app/api/dev-network/snapshot/route.ts
 *   export { dynamic, GET_SNAPSHOT as GET } from "next-fetch-panel/route"
 *
 * With access control:
 *   export const dynamic = "force-dynamic"
 *   export const GET = createDevPanelSnapshot({
 *     guard: (req) => {
 *       if (!isValidToken(req.headers.get("authorization")))
 *         return new Response("Forbidden", { status: 403 })
 *     },
 *   })
 */
export function createDevPanelSnapshot(options?: { guard?: GuardFn; enabled?: boolean }) {
  return async function GET(request: Request) {
    if (options?.enabled === false) return new Response(null, { status: 404 });

    const blocked = await options?.guard?.(request);
    if (blocked instanceof Response) return blocked;

    const sessionId =
      (await headers()).get(SESSION_HEADER) ?? (await cookies()).get(SESSION_COOKIE)?.value ?? null;

    const entries = devLogStore
      .getBuffer()
      .filter((e) => sessionId !== null && e.sessionId === sessionId);

    return Response.json({ entries });
  };
}

// Default export for the simple plug-and-play case.
export const GET_SNAPSHOT = createDevPanelSnapshot();
