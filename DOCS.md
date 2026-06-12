# next-fetch-panel — Technical Documentation

A self-contained npm library that intercepts all server-side `fetch()` calls in a Next.js App Router application and streams them live to a floating DevTools-style panel in the browser.

For integration instructions, see [README.md](./README.md).

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Redacting Secrets](#redacting-secrets)
- [Disabling per Environment](#disabling-per-environment)
- [Programmatic Control](#programmatic-control)
- [Panel UI](#panel-ui)
- [Configuration](#configuration)
- [Technical Notes & Gotchas](#technical-notes--gotchas)
- [Package Architecture](#package-architecture)
- [Why a Compiled Library?](#why-a-compiled-library)
- [Build Configuration](#build-configuration)
- [Module Boundary Splits](#module-boundary-splits)
- [Bundled UI Components](#bundled-ui-components)
- [Next.js Static Analysis Constraints](#nextjs-static-analysis-constraints)
- [The `"use client"` Directive Problem](#the-use-client-directive-problem)
- [globalThis Store Across Package Boundaries](#globalthis-store-across-package-boundaries)
- [Local Development with Workspaces](#local-development-with-workspaces)
- [Publishing Checklist](#publishing-checklist)

---

## Overview

Next.js Server Components and Route Handlers run `fetch()` on the server — invisible to browser DevTools. This library solves that by:

1. Patching `globalThis.fetch` at server startup to record every outgoing request
2. Streaming those records to the browser via Server-Sent Events (SSE)
3. Rendering them in a floating panel overlaid on the running app

Each browser session only sees the requests it triggered. Secret values (API keys, tokens, passwords) are redacted before being stored. The panel has no built-in environment gate — it can be used in development, staging, or any environment where server-side network visibility is needed. Each entry point accepts an `enabled` option (or prop) to disable it entirely for a given environment.

---

## Architecture

```
Browser (request)
│
└── middleware.ts                ← runs on every request
         │
         ├── reads/creates __dev_sid session cookie
         └── forwards it as x-dev-sid request header

Server (Node.js runtime)
│
├── instrumentation.ts          ← patches globalThis.fetch on startup
│        │
│        ├── reads x-dev-sid via headers() from the current request ALS context
│        ├── applies redactEntry() before storing
│        └──▶ src/store.ts       ← singleton pub/sub + 100-entry ring buffer
│                                    entries tagged with sessionId
│                                    (stored on globalThis to survive HMR)
│
└── app/api/dev-network/route.ts ← SSE endpoint (session-scoped)
         │
         ├── reads x-dev-sid from its own request headers
         ├── replays only buffer entries matching sessionId
         └── streams only new entries matching sessionId

Browser (Client)
│
└── src/Panel.tsx               ← "use client" floating panel
         │
         ├── EventSource → /api/dev-network  (browser sends __dev_sid cookie automatically)
         ├── Renders entries in a resizable table
         ├── Click-to-inspect detail pane (General / Headers / Payload / Response)
         └── localStorage-persisted settings
```

---

## How It Works

### 1. Fetch Interception (`src/patch.ts`)

`registerDevPanel()` is called once at server startup via `instrumentation.ts`. The function:

- Runs only in the `nodejs` runtime (skips Edge via `NEXT_RUNTIME !== "nodejs"`)
- Replaces `globalThis.fetch` with a wrapper that:
  - Captures method, URL, request headers, and request body (up to 50 KB)
  - Awaits the original fetch, then **clones** the response to read the body asynchronously without consuming the original stream
  - Records status, status text, response headers, response body (up to 50 KB), and duration
  - On network error: records the error message and pushes a partial entry
  - Reads `sessionId` via `headers()` from `next/headers` (see [why this works](#why-headers-works-inside-globalthistfetch))
  - Calls `redactEntry()` on the collected data before pushing to the store

Request body capture supports strings, `URLSearchParams`, and falls back to `"[binary]"` for other types.

### 2. Singleton Store (`src/store.ts`)

The store lives on `globalThis.__devLogStore` so it survives Next.js hot-reload (which re-imports modules but reuses the same Node.js process).

```ts
type LogEntry = {
  id: string;            // `${timestamp}-${random}`
  url: string;
  method: string;
  status: number | null;
  statusText: string | null;
  duration: number;      // milliseconds
  ts: number;            // Date.now() at request start
  error?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  sessionId: string | null;
};
```

The store keeps a ring buffer of the last 100 entries and notifies all subscribers on `push()`.

### 3. SSE Endpoint (`src/route.ts`)

`createDevPanelRoute()` returns a `GET` handler for `force-dynamic` routes. When a browser connects:

1. Opens a `ReadableStream`
2. **Replays** all buffered entries that match the session ID — this ensures requests that happened before the browser's `EventSource` opened are not lost
3. Subscribes to the store and streams new entries as `data: <json>\n\n` SSE frames filtered by session ID
4. Unsubscribes when the client disconnects (`cancel()`)

An optional `guard` function runs before the stream opens. Returning a `Response` from it blocks the connection — useful for protecting the endpoint in staging:

```ts
export const GET = createDevPanelRoute({
  guard: (request) => {
    if (!isAdmin(request)) return new Response("Forbidden", { status: 403 });
  },
});
```

### 4. Session Isolation (`src/middleware.ts` + `x-dev-sid` header)

Every browser session gets a unique ID via the `__dev_sid` cookie (generated on first visit, valid for one year). Session isolation relies on two cooperating mechanisms:

**Primary — `x-dev-sid` request header (set by middleware):** `withDevPanel()` reads or creates the cookie and forwards its value as `x-dev-sid` via `NextResponse.next({ request: { headers: ... } })`. This header is available immediately in `headers()` from `next/headers` — even on the very first page load, before `Set-Cookie` reaches the browser. The server-side fetch interceptors read it via `AsyncLocalStorage` to tag every `LogEntry` with a `sessionId`.

**Fallback — `__dev_sid` cookie read directly:** When middleware does not run for a route (for example, `/api/*` excluded from a custom matcher), `x-dev-sid` is never set. Both the fetch interceptors and the SSE handler fall back to reading `__dev_sid` from `cookies()`. The cookie is not `httpOnly` so that `Panel.tsx` can also create it client-side — in a `useEffect`, before the `EventSource` connection opens — in cases where even the fallback cookie doesn't exist yet.

**Null guard:** if neither mechanism produces a session ID (startup fetches, background jobs, or the very first render before any cookie exists), entries are stored with `sessionId: null`. The SSE handler guards against `null === null` matching, so null-tagged entries are never streamed to any browser.

The result: each browser sees only the server-side fetches it triggered, even in a multi-user staging environment.

#### `withDevPanel` return value

`withDevPanel` returns the middleware function directly, with `middleware` and `config` attached as properties. This supports both usage patterns without a breaking change:

```ts
// Destructured — convenient when you want the built-in default matcher
export const { middleware, config } = withDevPanel(handler)

// Direct — when you define config separately (e.g. complex custom matcher)
export const middleware = withDevPanel(handler)
export const config = { matcher: ["..."] }
```

In Next.js 16+, the file was renamed from `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`. The function works identically — just match the export name to what your Next.js version expects:

```ts
// proxy.ts (Next.js 16+)
export const proxy = withDevPanel(handler)
export const config = { matcher: ["..."] }
```

### 5. Axios Support (`src/interceptor.ts`)

By default, axios in Node.js uses the `http`/`https` modules and bypasses `globalThis.fetch` entirely. Even when configured with `adapter: 'fetch'`, axios caches the original fetch reference at import time — before `instrumentation.ts` has had a chance to patch it — so axios calls still won't appear in the panel.

The recommended approach is `createDevPanelAxiosInterceptors()` from `next-fetch-panel/interceptor`. Register it **before** your existing interceptors using synchronous `require()` so the response interceptor sees the raw `AxiosResponse` before any transformation:

```ts
if (typeof window === "undefined") {
  try {
    const { createDevPanelAxiosInterceptors } = require("next-fetch-panel/interceptor");
    const { request, response, error } = createDevPanelAxiosInterceptors();
    axiosClient.interceptors.request.use(request);
    axiosClient.interceptors.response.use(response, error);
  } catch {}
}
```

`adapter: 'fetch'` is **not** required — the interceptors work with any axios adapter. They directly call `devLogStore.push()`, bypassing the fetch patch entirely, so they capture axios requests regardless of which adapter is in use.

### 6. Client Panel (`src/Panel.tsx`)

A `"use client"` component rendered unconditionally inside `RootLayout`. On mount it:

- Opens an `EventSource` to `/api/dev-network` (the browser automatically sends the `__dev_sid` cookie)
- Parses incoming entries and stores them in local state (capped at 100)
- Renders the panel UI when the user clicks the toggle button

---

## Redacting Secrets

Redaction happens in `src/patch.ts` and `src/interceptor.ts` immediately after a response is received — the raw value is never written to the store or sent to the browser.

### Default patterns (`src/redact.ts`)

```ts
export const defaultRedactConfig: RedactConfig = {
  urlParams: ["api_key", "apikey", "secret", "token", "access_token", "password", "key"],
  headers:   ["authorization", "x-api-key", "x-secret", "x-auth-token"],
  bodyKeys:  ["password", "secret", "token", "api_key", "apiKey", "accessToken", "access_token"],
};
```

Matching is:
- **URL params** — exact match against the query parameter name
- **Headers** — case-insensitive match against the header name
- **Body keys** — exact match against top-level JSON keys (non-JSON bodies are left untouched)

Matched values are replaced with `[REDACTED]`. The actual HTTP request is never modified — only the copy stored for display.

### Customizing redaction

Pass a `redact` option to `registerDevPanel` and/or `createDevPanelAxiosInterceptors`:

```ts
type RedactInput =
  | Partial<RedactConfig>                                   // plain object — replaces each provided category
  | ((defaults: RedactConfig) => Partial<RedactConfig>);   // function — full control
```

**Extend** — keep defaults, add your own keys:
```ts
await registerDevPanel({
  redact: (defaults) => ({
    ...defaults,
    urlParams: [...defaults.urlParams, "shop_token"],
    bodyKeys:  [...defaults.bodyKeys,  "refreshToken"],
  }),
});
```

**Override a category** — replace the default list entirely:
```ts
await registerDevPanel({
  redact: { headers: ["x-my-secret"] },
});
```

**Disable a category** — pass an empty array:
```ts
await registerDevPanel({
  redact: { headers: [] },
});
```

**Remove one entry from defaults**:
```ts
await registerDevPanel({
  redact: (d) => ({
    ...d,
    headers: d.headers.filter((h) => h !== "authorization"),
  }),
});
```

Both `registerDevPanel` and `createDevPanelAxiosInterceptors` accept the same `redact` option independently, so you can configure them differently if needed.

---

## Disabling per Environment

Every entry point accepts an `enabled` option (defaulting to `true`). Pass `false` to make that layer a complete no-op — no patching, no cookies, no SSE stream, no panel rendered.

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

You can use any condition — `NODE_ENV`, a custom env var, a feature flag, or any boolean expression. Each entry point is independent, so you can disable only the server-side patching while keeping the route handler open for other sessions, or vice versa.

When `enabled` is `false`:
- `registerDevPanel` — returns immediately, `globalThis.fetch` is not patched
- `withDevPanel` — skips session cookie logic, calls through to your handler if provided, returns `NextResponse.next()`
- `createDevPanelRoute` — returns `404`
- `createDevPanelAxiosInterceptors` — returns identity interceptors (request/response pass through unchanged)
- `<DevNetworkPanel>` — renders `null`

---

## Programmatic Control

The panel's open/closed state lives in a module-level store (`src/panel-state.ts`), shared across the entire app. Use the `useDevNetworkPanel` hook to read and control it from any client component.

```tsx
"use client";
import { useDevNetworkPanel } from "next-fetch-panel";

export function MyToolbar() {
  const { isOpen, open, close, toggle } = useDevNetworkPanel();
  return <button onClick={toggle}>{isOpen ? "Hide" : "Show"} network panel</button>;
}
```

| Value | Type | Description |
|-------|------|-------------|
| `isOpen` | `boolean` | Current open state, reactive — updates on every change |
| `open` | `() => void` | Opens the panel (no-op if already open) |
| `close` | `() => void` | Closes the panel (no-op if already closed) |
| `toggle` | `() => void` | Flips the current state |

`open`, `close`, and `toggle` are stable module-level references — safe as event handlers without `useCallback`.

### Hiding the default toggle button

Pass `showToggleButton={false}` to `<DevNetworkPanel>` when you want to drive the panel entirely from your own UI:

```tsx
<DevNetworkPanel showToggleButton={false} />
```

The default floating "Server Network" button is then never rendered. The panel itself still opens and closes normally via `useDevNetworkPanel`.

---

## Panel UI

### Toggle Button

A fixed floating button. Shows a green dot when entries exist and a count badge. Hides itself when the panel is open to avoid overlapping.

Position is controlled by the `buttonPosition` prop on `<DevNetworkPanel>` (default `"bottom-right"`):

| Value | Position |
|-------|----------|
| `"bottom-right"` | Bottom-right corner *(default)* |
| `"bottom-center"` | Bottom edge, centered |
| `"bottom-left"` | Bottom-left corner |
| `"top-right"` | Top-right corner |
| `"top-center"` | Top edge, centered |
| `"top-left"` | Top-left corner |

The button can be hidden entirely with `showToggleButton={false}` — see [Programmatic Control](#programmatic-control).

### Panel Modes

| Mode | Description |
|------|-------------|
| **Sheet** | Slides in from any edge (bottom / right / top / left). Resizable by dragging the edge handle. |
| **Fixed modal** | Positioned fixed near the toggle button with configurable width and height |

### Sheet Resize Handle

In sheet mode, a thin drag strip is placed at the open edge of the sheet (top edge for a bottom sheet, left edge for a right sheet, etc.). Hovering over it reveals a pill indicator; dragging resizes the sheet live. The new size is saved to `localStorage` immediately and restored on the next page load. The size is shared with the fixed mode `width`/`height` settings.

### Request Table

| Column | Description |
|--------|-------------|
| Method | Color-coded (GET = blue, POST = violet, PUT/PATCH = orange, DELETE = red) |
| Status | Color-coded (2xx = green, 3xx = amber, 4xx/5xx/error = red) |
| URL | Truncated to available width |
| Duration | Milliseconds |

Click any row to open the detail pane. Click the same row again to close it.

### Filter Bar

A search input above the request list. Type any substring to filter requests by URL. The counter shows `X / Y requests` when a filter is active. Selecting an entry and then narrowing the filter so it no longer matches auto-deselects the detail pane. Click the **×** icon or clear the input to reset.

### Detail Pane

Opens to the right of the table inside a `ResizablePanelGroup`. The split is user-adjustable and the size is persisted to `localStorage`. Four tabs:

| Tab | Contents |
|-----|----------|
| **General** | URL, method, status code, start time, duration, duration bar |
| **Headers** | Response headers stacked above request headers |
| **Payload** | Request body, auto-formatted if JSON |
| **Response** | Response body, auto-formatted if JSON |

### Toolbar

- **Server Network** label + request count
- **Settings** gear icon — opens the settings dialog
- **Clear** button — clears all entries, closes the detail pane, and persists a `clearedAt` timestamp to `localStorage` so cleared entries don't reappear after a page refresh
- **×** close button — closes the panel, shows the toggle button

---

## Configuration

All settings are persisted to `localStorage` under the key `ssr-panel-config`. Changes take effect immediately without a page reload.

```ts
type PanelConfig = {
  mode: "sheet" | "fixed";
  sheetSide: "bottom" | "right" | "top" | "left";
  sheetModal: boolean;        // true = blocks page interaction
  width: number;              // px — fixed mode width; also set by drag-resizing a left/right sheet
  height: number;             // px — fixed mode height; also set by drag-resizing a bottom/top sheet
  colorScheme: "system" | "light" | "dark";
  detailSize: number;         // detail pane width as % of panel body (0–100)
};
```

Default values:

```ts
{
  mode: "sheet",
  sheetSide: "bottom",
  sheetModal: false,
  width: 820,
  height: 420,
  colorScheme: "system",
  detailSize: 40,
}
```

**Sheet mode** — `sheetModal: false` means no backdrop and outside clicks do not close the panel, letting the user interact with the page while the panel is open.

**Color scheme** — `system` follows `prefers-color-scheme` and updates live. The `dark` class is applied directly to the panel container (Sheet, fixed div, and settings Dialog) because they render in portals outside the app's theme tree.

---

## Technical Notes & Gotchas

### Why `globalThis.__devLogStore`?

Next.js HMR re-evaluates modules on each change, creating a new store instance. Attaching the store to `globalThis` ensures there is always exactly one instance per Node.js process, and it survives hot-reloads.

### `instrumentation.ts` location

Next.js expects `instrumentation.ts` at the root of the project, or inside `src/` if the project uses a `src/` directory. Placing it at the root when `src/` exists (or vice versa) causes the `register()` function to never run, meaning `globalThis.fetch` is never patched and no requests appear in the panel. Confirm the file is in `src/instrumentation.ts` if your project has a `src/` layout.

### Why buffer replay on SSE connect?

SSR fetches execute during the request lifecycle, often completing before the browser has opened the `EventSource` connection. The 100-entry buffer captures these pre-connect entries and replays them as the first frames on every new SSE connection.

### Why Clear uses a `localStorage` timestamp instead of clearing the server buffer

A naive "clear" would only wipe the client-side React state. On the next page refresh, the SSE endpoint replays the server buffer for the session, and all the cleared entries reappear.

Clearing the server buffer is not an option either — the buffer is a shared singleton. Removing entries for one session would affect other users connected to the same server (relevant in staging environments with multiple concurrent users).

The solution: on clear, `Date.now()` is written to `localStorage` under `next-fetch-panel-cleared-at`. On mount, the panel reads this value into a ref. Every SSE message — including replayed ones — is filtered against it: entries with `ts <= clearedAt` are discarded before reaching React state. The server buffer is never touched, so other users are unaffected.

### Why `response.clone().text().then(...)` instead of `await response.text()`?

`fetch()` response bodies are single-use streams. Reading the body would consume it, making the response unusable by the caller. `.clone()` creates an independent copy of the stream for reading, leaving the original intact.

### Session isolation: why both `x-dev-sid` header and the cookie

Middleware can set cookies only in the **response** — they arrive at the browser after the page render, not before. On the very first visit the `__dev_sid` cookie does not exist when the incoming request arrives, so reading `cookies()` inside the fetch patch would yield null and miss that page's requests.

Forwarding the session ID as an **`x-dev-sid` request header** (via `NextResponse.next({ request: { headers: ... } })`) solves the first-visit case: the header is present on the incoming request immediately, regardless of whether the cookie exists yet.

However, when middleware does not run for a route (e.g. a custom matcher that excludes `/api/*`), neither the `x-dev-sid` header nor a server-set cookie are available for those requests. The fallback is the `__dev_sid` cookie itself, read directly via `cookies()`. To guarantee the cookie exists before the `EventSource` connection opens, `Panel.tsx` creates it client-side in a `useEffect` if middleware hasn't done so yet. The cookie is not `httpOnly` specifically to allow this client-side creation.

### Why `headers()` works inside `globalThis.fetch`

`headers()` from `next/headers` reads from Next.js's internal `RequestAsyncStorage` — a Node.js `AsyncLocalStorage` instance that is set for the duration of each request's async execution tree. Since our patched `globalThis.fetch` is just an async function called from within a Server Component (which runs inside that tree), the ALS context is present and `headers()` returns the current request's headers. For fetches made outside any request context (startup, background tasks), `headers()` throws and we catch it, leaving `sessionId: null`.

### Portal dark mode

`@base-ui/react` `Sheet` and `Dialog` render into a portal at the document root, outside any `div.dark` wrapper in the component tree. Dark mode is applied by adding the `dark` class directly to the `SheetContent` / `DialogContent` element and using semantic Tailwind tokens (`bg-background`, `text-foreground`, etc.) instead of hardcoded colors.

### Hydration mismatch prevention

The `colorScheme` is read from `localStorage` during client initialization, which differs from the server-rendered value. The panel uses `useSyncExternalStore` to return `false` on the server and `true` on the client. `isDark` is always `false` during SSR and only resolves to the correct value after hydration. The panel returns `null` until mounted, preventing any flash of incorrect theming.

### Non-modal sheet dismissal

`@base-ui/react/dialog` (which backs the Sheet component) closes on outside click by default even when `modal={false}`. The `onOpenChange` handler is overridden to swallow close events when `sheetModal` is false, so clicks on the page do not close the panel.

### Resizable detail pane (react-resizable-panels v4)

v4 has a substantially different API from earlier versions:

- Sizes are percentages (0–100) as `number`
- `onLayoutChanged` fires only after a user-completed drag — this is used for saving `detailSize`
- Panel registration happens asynchronously after mount; `setLayout` is deferred with `setTimeout(0)` to ensure the detail panel is registered with the Group before the initial size is applied
- `useGroupRef` / `usePanelRef` hooks replace the old `ref` prop pattern

### Dialog z-index

The settings `Dialog` is set to `z-10000` (overlay and popup) so it always renders above the `Sheet` (`z-50`) and the fixed panel container (`z-9998`) regardless of DOM order.

---

## Package Architecture

```
packages/next-fetch-panel/
├── src/
│   ├── index.ts        Public entry — DevNetworkPanel + LogEntry type ("use client")
│   ├── patch.ts        Server entry — globalThis.fetch patch + registerDevPanel()
│   ├── middleware.ts   Server entry — session cookie + withDevPanel()
│   ├── route.ts        Server entry — SSE handler + createDevPanelRoute()
│   ├── interceptor.ts  Server entry — axios interceptors + createDevPanelAxiosInterceptors()
│   ├── store.ts        Singleton pub/sub store (internal, shared via globalThis)
│   ├── redact.ts       Secret redaction (internal)
│   ├── utils.ts        cn() utility (internal)
│   ├── Panel.tsx       "use client" floating panel component
│   └── ui/             Self-contained copies of shadcn UI components
├── dist/               compiled output
│   ├── index.mjs / index.js / index.d.ts
│   ├── patch.mjs / patch.js / patch.d.ts
│   ├── middleware.mjs / middleware.js / middleware.d.ts
│   ├── route.mjs / route.js / route.d.ts
│   └── interceptor.mjs / interceptor.js / interceptor.d.ts
├── package.json
├── tsup.config.ts
└── tsconfig.json
```

### Public exports

```ts
import { DevNetworkPanel } from "next-fetch-panel";
import type { LogEntry } from "next-fetch-panel";

import { registerDevPanel } from "next-fetch-panel/patch";
import { withDevPanel } from "next-fetch-panel/middleware";
import { createDevPanelRoute } from "next-fetch-panel/route";
import { createDevPanelAxiosInterceptors } from "next-fetch-panel/interceptor";
```

Server utilities are only accessible via sub-path imports. The root `"next-fetch-panel"` entry is client-only so it can carry `"use client"` without affecting server code.

---

## Why a Compiled Library?

The `server-network-panel/` folder inside the app works by relying on Next.js's Turbopack/webpack to resolve `@/` path aliases and process TSX. This approach breaks the moment the code lives outside the project because:

1. **Path aliases don't cross package boundaries** — `@/lib/utils` and `@/components/ui/*` are resolved relative to the app's `tsconfig.json`, not the library's.
2. **Next.js does not transpile `node_modules`** by default — importing raw TSX from an npm package fails unless the consumer adds the package to `transpilePackages`.
3. **`"use client"` handling differs in compiled vs source files** — esbuild strips string-literal expressions at compile time (see [The `"use client"` Problem](#the-use-client-directive-problem)).

Compiling to `dist/` with tsup solves all three: path aliases are resolved at build time, the output is plain JavaScript any bundler understands, and `"use client"` is inserted explicitly as a banner.

---

## Build Configuration

The build tool is [tsup](https://tsup.egoist.dev/), which wraps esbuild for fast bundling and `tsc` for type declarations.

### Two pipelines

The config is split into two separate pipelines because the index entry needs a `"use client"` banner that must not appear in the server-side entries:

```ts
export default defineConfig([
  // Pipeline 1: Client bundle
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    splitting: true,
    clean: true,
    external: [...],
    banner: { js: '"use client";' },
  },
  // Pipeline 2: Server bundles
  {
    entry: {
      patch: "src/patch.ts",
      middleware: "src/middleware.ts",
      route: "src/route.ts",
      interceptor: "src/interceptor.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    external: [...],
  },
]);
```

### Why both CJS and ESM?

Next.js App Router Server Components use ESM. `instrumentation.ts` may be processed in contexts that expect CJS. Publishing both formats lets Node.js and bundlers pick the right one via `package.json` `exports` conditions.

### External dependencies

All peer dependencies (`react`, `next`, `@base-ui/react`, `lucide-react`, etc.) are marked `external`. They are not bundled into `dist/`. This keeps the package size small and avoids shipping duplicate React instances. The only code that IS bundled is the library's own logic: store, redact, utils, and the UI component definitions.

### `ES2020.Intl` in `tsconfig.json`

The panel uses `fractionalSecondDigits` in `toLocaleTimeString`. This option is typed under `ES2020.Intl`, which is not included in the default `ES2020` lib. Adding `"ES2020.Intl"` to the `lib` array in `tsconfig.json` is required for the DTS build to pass.

---

## Module Boundary Splits

The library is split into four entry points, each with a distinct runtime environment:

| Entry | Runtime | `"use client"` | Purpose |
|-------|---------|----------------|---------|
| `next-fetch-panel` | Browser | Yes | Panel React component |
| `next-fetch-panel/patch` | Node.js server | No | `globalThis.fetch` interception |
| `next-fetch-panel/middleware` | Node.js / Edge | No | Session cookie + header |
| `next-fetch-panel/route` | Node.js server | No | SSE stream handler |
| `next-fetch-panel/interceptor` | Node.js server | No | Axios request interception |

### Why server utilities are not in the root index

If `index.ts` re-exported `withDevPanel` and `registerDevPanel` alongside `DevNetworkPanel`:

1. The root entry is marked `"use client"`. Any server-only module (e.g., `next/headers`) imported transitively would fail with a "cannot import in Client Component" error.
2. Bundlers would include server-only code in the browser bundle.

The root entry exports only `DevNetworkPanel` and the `LogEntry` type. All server utilities require an explicit sub-path import.

---

## Bundled UI Components

The original `server-network-panel/Panel.tsx` imported UI components via `@/components/ui/*` and a utility via `@/lib/utils`. These aliases cannot be used in a library. The components are copied into `src/ui/` with two import paths updated:

| Original | Library |
|----------|---------|
| `import { cn } from "@/lib/utils"` | `import { cn } from "../utils"` |
| `import { Button } from "@/components/ui/button"` | `import { Button } from "./button"` |

Everything else — class names, prop types, primitives — is identical. Components use only peer dependencies and `../utils`, so they are self-contained.

### Why copy instead of a shared package?

The UI components are implementation details of the panel, not a reusable component library. A shared package would add indirection with no benefit. The library version stays stable until explicitly synced with the app's shadcn version.

---

## Next.js Static Analysis Constraints

Next.js performs **static analysis** (AST-level, not runtime) on certain exports to configure its compiler:

- `config` in `middleware.ts` — the route matcher
- `dynamic` in route handlers — e.g. `"force-dynamic"`

It cannot follow re-exports from npm packages. If the value is not a literal in the file being analyzed, Next.js falls back to defaults.

```ts
// ❌ Next.js cannot read these from a compiled package
export { config } from "next-fetch-panel/middleware";
export { dynamic } from "next-fetch-panel/route";

// ✅ Literal in the consuming file — statically readable
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
export const dynamic = "force-dynamic";
```

This is why the integration files must define these values locally. The library exports the behavior (`middleware`, `GET`) and the consumer defines the static metadata (`config`, `dynamic`) inline. This split is intentional, not a limitation.

---

## The `"use client"` Directive Problem

### How it works in source files

In a Next.js project, `"use client"` at the top of a file marks it as a Client Component boundary. The compiler traverses the import graph from that point as client code.

### How it breaks in compiled packages

When tsup compiles `Panel.tsx`, esbuild treats `"use client"` as a bare string expression and removes it as dead code. The compiled `dist/index.mjs` has no directive. Next.js processes the file from `node_modules` as a Server Component, finds React hooks, and fails:

```
You're importing a module that depends on `useEffect` into a React Server Component module.
```

### The fix: `banner` in tsup

`banner: { js: '"use client";' }` prepends the string before any other content in the compiled output. The resulting `dist/index.mjs` starts with `"use client";`, which Next.js correctly processes as a Client Component boundary.

The banner is applied only to the index pipeline. Server-side entries must not carry it.

---

## globalThis Store Across Package Boundaries

Without the `globalThis` pattern, `dist/patch.mjs` and `dist/route.mjs` would each get their own `store` variable — two separate instances. The route's store would never receive entries pushed by the patch.

```ts
// src/store.ts
const devLogStore = globalThis.__devLogStore ?? (globalThis.__devLogStore = createStore());
```

`globalThis` is shared across all modules in the same Node.js process regardless of import path. The first module to evaluate this line creates and attaches the store; every subsequent evaluation — from any entry point — finds and reuses it. This also survives HMR because `globalThis` is the process's global object, not the module cache.

---

## Local Development with Workspaces

The library is tested locally using npm workspaces, which uses the official resolution path and avoids `npm link` symlink edge cases.

Root `package.json`:
```json
{
  "workspaces": ["packages/*"],
  "dependencies": { "next-fetch-panel": "*" }
}
```

After `npm install` at the root, npm creates:
```
node_modules/next-fetch-panel → packages/next-fetch-panel
```

**The library must be built for changes to be visible in the app** — workspace resolution points to `dist/`, not `src/`.

```bash
cd packages/next-fetch-panel
npm run build      # one-off build
npm run dev        # tsup --watch, rebuilds on change
```

`"next-fetch-panel": "*"` resolves to the local workspace package regardless of version. After publishing, change to `"^0.1.0"`.

---

## Publishing Checklist

Before `npm publish`:

1. `npm run build` — verify `dist/` has `.mjs`, `.js`, `.d.ts`, and `.d.mts` files for all five entries.
2. `head -1 dist/index.mjs` — must show `"use client";`.
3. `head -1 dist/patch.mjs` — must NOT start with `"use client"`.
4. `package.json` `files` field — only `dist/` and `README.md`; not `src/`, `tsup.config.ts`, or `tsconfig.json`.
5. Peer dependencies — `react`, `next`, `react-dom` are in `peerDependencies`, not `dependencies`.
6. `exports` map — all five sub-paths (`.`, `./patch`, `./middleware`, `./route`, `./interceptor`) point to existing `dist/` files.
7. `npm pack` — install the resulting tarball in a clean project to confirm it works outside the monorepo.
