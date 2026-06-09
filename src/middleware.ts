import { NextRequest, NextResponse } from "next/server";

type MiddlewareHandler = (
  request: NextRequest
) =>
  | NextResponse
  | Response
  | null
  | undefined
  | void
  | Promise<NextResponse | Response | null | undefined | void>;

/**
 * Wraps your existing middleware with the dev panel session logic.
 *
 * Simple (no other middleware):
 *   export const { middleware, config } = withDevPanel()
 *
 * With your own logic:
 *   export const { middleware, config } = withDevPanel(async (request) => {
 *     if (!isAuthenticated(request))
 *       return NextResponse.redirect(new URL("/login", request.url))
 *     // return nothing to let the request continue normally
 *   })
 *
 * Custom matcher:
 *   export const { middleware, config } = withDevPanel(handler, {
 *     matcher: ["/api/:path*", "/((?!_next).*)"],
 *   })
 */
export function withDevPanel(
  handler?: MiddlewareHandler,
  options?: { matcher?: string[] }
) {
  async function middleware(request: NextRequest) {
    const existing = request.cookies.get("__dev_sid")?.value;
    const sid = existing ?? crypto.randomUUID();

    // Run the caller's middleware logic first so it can redirect/short-circuit.
    const userResponse = await handler?.(request);

    let response: NextResponse;

    if (userResponse instanceof Response) {
      // Caller returned a redirect, rewrite, or error — respect it.
      // The x-dev-sid header will be forwarded on the next normal request.
      response = userResponse as NextResponse;
    } else {
      // Normal render: forward the session ID as a request header so
      // headers() from next/headers propagates it through the entire
      // request async context, including inside the fetch patch.
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-dev-sid", sid);
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (!existing) {
      response.cookies.set("__dev_sid", sid, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  }

  return {
    middleware,
    config: {
      matcher: options?.matcher ?? ["/((?!_next/static|_next/image|favicon.ico).*)"],
    },
  };
}

// Default export for the simple plug-and-play case used by the root middleware.ts.
export const { middleware, config } = withDevPanel();
