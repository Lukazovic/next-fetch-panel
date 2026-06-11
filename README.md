# next-fetch-panel

A real-time DevTools panel that intercepts all server-side `fetch()` calls in a Next.js App Router application and streams them to a floating panel in the browser. Each browser session only sees its own requests, so it is safe to run in shared environments like staging.

---

## Requirements

- Next.js 15 or 16 (App Router)
- React 19
- Node.js runtime (not Edge)

---

## Installation

```bash
npm install next-fetch-panel
```

---

## Wiring it up

There are four integration points. Each one has a **simple form** (one line, nothing else needed) and a **composable form** (for projects that already have logic in those files).

---

### 1. `instrumentation.ts` — fetch interception

**Simple** — nothing else in your `instrumentation.ts`:

```ts
// instrumentation.ts
export { register } from "next-fetch-panel/patch";
```

**Composable** — you already have setup code:

```ts
// instrumentation.ts
import { registerDevPanel } from "next-fetch-panel/patch";
import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel("my-app");
  await registerDevPanel();
}
```

`registerDevPanel` skips itself when `NEXT_RUNTIME !== "nodejs"` so it never runs in Edge contexts.

---

### 2. `middleware.ts` / `proxy.ts` — session isolation

> **Next.js 16+** renamed this file from `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`. Both versions work the same way — match the file name and export name to your Next.js version.

**Simple** — no other middleware (Next.js ≤ 15):

```ts
// middleware.ts
export { middleware, config } from "next-fetch-panel/middleware";
```

**Simple** — Next.js 16+:

```ts
// proxy.ts
import { withDevPanel } from "next-fetch-panel/middleware";

export const proxy = withDevPanel();
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

**Composable** — you already have your own logic:

```ts
// proxy.ts (Next.js 16+) or middleware.ts (Next.js ≤ 15)
import { withDevPanel } from "next-fetch-panel/middleware";

export const proxy = withDevPanel(async (request) => {
  if (!request.cookies.has("auth-token"))
    return NextResponse.redirect(new URL("/login", request.url));
  // return nothing to let the request continue normally
});

export const config = {
  matcher: ["/(ca|us)/:path*", "/((?!api|_next|.*\\..*).*)"],
};
```

`withDevPanel` handles `NextResponse.next()` internally — only return a response when you want to block or redirect. The function itself is the middleware handler, so you can export it directly as `proxy`, `middleware`, or any name your project uses.

---

### 3. `app/api/dev-network/route.ts` — SSE stream

**Simple** — no access control needed:

```ts
// app/api/dev-network/route.ts
export { dynamic, GET } from "next-fetch-panel/route";
```

**Composable** — restrict access (recommended for staging):

```ts
// app/api/dev-network/route.ts
import { createDevPanelRoute } from "next-fetch-panel/route";

export const dynamic = "force-dynamic";
export const GET = createDevPanelRoute({
  guard: (request) => {
    const token = request.headers.get("authorization");
    if (!isValidAdminToken(token))
      return new Response("Forbidden", { status: 403 });
  },
});
```

---

### 4. `app/layout.tsx` — panel component

```tsx
// app/layout.tsx
import { DevNetworkPanel } from "next-fetch-panel";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <DevNetworkPanel />
      </body>
    </html>
  );
}
```

---

## Redacting secrets

By default, the panel redacts:

- URL params: `api_key`, `apikey`, `secret`, `token`, `access_token`, `password`, `key`
- Headers: `authorization`, `x-api-key`, `x-secret`, `x-auth-token`
- JSON body keys: `password`, `secret`, `token`, `api_key`, `apiKey`, `accessToken`, `access_token`

Pass a `redact` option to `registerDevPanel` and/or `createDevPanelAxiosInterceptors` to customize:

```ts
// extend defaults — keep existing patterns, add your own
await registerDevPanel({
  redact: (defaults) => ({
    ...defaults,
    urlParams: [...defaults.urlParams, "shop_token"],
    bodyKeys:  [...defaults.bodyKeys,  "refreshToken"],
  }),
});

// override a category entirely — only these values will be redacted
await registerDevPanel({
  redact: { headers: ["x-my-secret"] },
});

// disable a category — show everything
await registerDevPanel({
  redact: { headers: [] },
});
```

The same `redact` option is available on `createDevPanelAxiosInterceptors({ redact: ... })`.

The actual HTTP request is never modified — only the copy kept for display.

---

## Using axios

Register the dev panel interceptors **before** your own interceptors. Use a synchronous `require()` so they run first in the response chain:

```ts
// your-axios-client.ts
import axios from "axios";

const http = axios.create({ baseURL: "https://api.example.com" });

if (typeof window === "undefined") {
  try {
    const { createDevPanelAxiosInterceptors } = require("next-fetch-panel/interceptor");
    const { request, response, error } = createDevPanelAxiosInterceptors();
    http.interceptors.request.use(request);
    http.interceptors.response.use(response, error);
  } catch {}
}

export default http;
```

No axios configuration change is required — `adapter: 'fetch'` is **not** needed. The interceptors work with any axios adapter and complement `instrumentation.ts`: native `fetch()` calls are captured by the fetch patch, axios calls are captured by the interceptors.

---

## Disabling per environment

Every entry point accepts an `enabled` option (or prop) that defaults to `true`. Pass `false` to make that layer a complete no-op — no patching, no cookies, no SSE stream, no panel rendered.

```ts
// instrumentation.ts
await registerDevPanel({ enabled: process.env.NODE_ENV !== "production" });

// middleware.ts / proxy.ts
export const middleware = withDevPanel(handler, { enabled: process.env.NODE_ENV !== "production" });

// app/api/dev-network/route.ts
export const GET = createDevPanelRoute({ enabled: process.env.NODE_ENV !== "production" });

// axios client
createDevPanelAxiosInterceptors({ enabled: process.env.NODE_ENV !== "production" });

// app/layout.tsx
<DevNetworkPanel enabled={process.env.NODE_ENV !== "production"} />
```

You can use any condition — `NODE_ENV`, a custom env var, a feature flag, or any boolean. Each entry point is independent, so you can disable just the fetch patch while keeping the panel open for other sessions, or shut everything off at once.

---

## Security notes

| Concern | How it is handled |
|---|---|
| User A seeing User B's requests | Each browser session gets a unique `__dev_sid` cookie. The SSE stream filters strictly by session ID. |
| Panel accessible to anyone | Use the `guard` option on `createDevPanelRoute`. |
| Secrets leaking to the browser | Configured patterns are replaced with `[REDACTED]` before entries reach the store. |
| Running in production | Pass `enabled: process.env.NODE_ENV !== "production"` to each entry point. |

---

## Public API

```ts
import { DevNetworkPanel } from "next-fetch-panel";
import type { LogEntry } from "next-fetch-panel";

import { registerDevPanel } from "next-fetch-panel/patch";
import { withDevPanel } from "next-fetch-panel/middleware";
import { createDevPanelRoute } from "next-fetch-panel/route";
import { createDevPanelAxiosInterceptors } from "next-fetch-panel/interceptor";
```
