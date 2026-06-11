import { NextRequest, NextResponse } from "next/server";

type MiddlewareResult =
  | NextResponse
  | Response
  | null
  | undefined
  | void
  | Promise<NextResponse | Response | null | undefined | void>;

/**
 * Wraps your existing middleware with the dev panel session logic.
 *
 * Returns the middleware function directly — use it however fits your project:
 *
 * Direct export (use the function as-is):
 *   export const middleware = withDevPanel()
 *   export const config = { matcher: ["..."] }
 *
 * Destructured (when you want the built-in default matcher):
 *   export const { middleware, config } = withDevPanel()
 *
 * With your own logic:
 *   export const middleware = withDevPanel(async (request) => {
 *     if (!isAuthenticated(request))
 *       return NextResponse.redirect(new URL("/login", request.url))
 *     // return nothing to let the request continue normally
 *   })
 *
 * If your project's NextRequest type conflicts with this lib's Next.js version,
 * pass it as a type parameter — TypeScript infers the handler's request type:
 *   export const middleware = withDevPanel<NextRequest>(async (req) => { ... })
 */
export function withDevPanel<TRequest = NextRequest>(
  handler?: (request: TRequest) => MiddlewareResult,
  options?: { matcher?: string[]; enabled?: boolean }
) {
  async function middleware(request: NextRequest) {
    if (options?.enabled === false) {
      const userResponse = await handler?.(request as unknown as TRequest);
      if (userResponse instanceof Response) return userResponse as NextResponse;
      return NextResponse.next();
    }
    const existing = request.cookies.get("__dev_sid")?.value;
    const sid = existing ?? crypto.randomUUID();

    // Run the caller's middleware logic first so it can redirect/short-circuit.
    const userResponse = await handler?.(request as unknown as TRequest);

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

  const config = {
    matcher: options?.matcher ?? ["/((?!_next/static|_next/image|favicon.ico).*)"],
  };

  // Attach middleware and config as properties so both usage patterns work:
  //   export const proxy = withDevPanel(handler)          // direct function
  //   export const { middleware, config } = withDevPanel() // destructured
  return Object.assign(middleware, { middleware, config });
}

// Default export for the simple plug-and-play case used by the root middleware.ts.
export const { middleware, config } = withDevPanel();
