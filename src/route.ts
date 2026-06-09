import { headers } from "next/headers";
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
export function createDevPanelRoute(options?: { guard?: GuardFn }) {
  return async function GET(request: Request) {
    const blocked = await options?.guard?.(request);
    if (blocked instanceof Response) return blocked;

    // Middleware sets x-dev-sid on every request from the same browser session,
    // so each client only receives its own server-side fetches.
    const sessionId = (await headers()).get("x-dev-sid");

    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const encode = (entry: unknown) =>
          encoder.encode(`data: ${JSON.stringify(entry)}\n\n`);

        for (const entry of devLogStore.getBuffer()) {
          if (entry.sessionId === sessionId) controller.enqueue(encode(entry));
        }

        unsubscribe = devLogStore.subscribe((entry) => {
          if (entry.sessionId !== sessionId) return;
          try {
            controller.enqueue(encode(entry));
          } catch {
            // client disconnected mid-write; cancel handles cleanup
          }
        });
      },
      cancel() {
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
