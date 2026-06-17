import { cookies, headers } from "next/headers";
import { devLogStore } from "./store";

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
      (await headers()).get("x-dev-sid") ??
      (await cookies()).get("__dev_sid")?.value ??
      null;

    let unsubscribe: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const encode = (entry: unknown) =>
          encoder.encode(`data: ${JSON.stringify(entry)}\n\n`);

        // Sent immediately so proxies with a first-byte timeout (e.g. Varnish) don't
        // close the connection before the first real data or heartbeat arrives.
        controller.enqueue(encoder.encode(": connected\n\n"));

        for (const entry of devLogStore.getBuffer()) {
          if (sessionId && entry.sessionId === sessionId) controller.enqueue(encode(entry));
        }

        // SSE comment sent every 15 s — keeps proxies and load balancers from
        // closing idle connections before the client disconnects.
        heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
        }, 15_000);

        unsubscribe = devLogStore.subscribe((entry) => {
          if (!sessionId || entry.sessionId !== sessionId) return;
          try {
            controller.enqueue(encode(entry));
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
