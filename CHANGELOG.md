# Changelog

## [0.4.4] — 2026-06-13

### Added

- **`bodyLimit` option on `registerDevPanel` and `createDevPanelAxiosInterceptors`** — controls how many bytes of each request/response body are captured before being stored (default: `100_000` / 100 KB). Useful when responses are very large and the default limit truncates them.
- **`bufferSize` option on `registerDevPanel`** — resizes the server-side ring buffer at runtime (default: `100` entries). Calls `devLogStore.configure()` immediately, trimming the buffer if it already exceeds the new limit.
- **`bufferSize` prop on `<DevNetworkPanel>`** — keeps the client display cap in sync with the server buffer. Defaults to `BUFFER_SIZE` (100).

### Fixed

- **Duplicate entries on SSE reconnect** — the SSE endpoint now emits an `id:` field with every event. On reconnect, the browser sends `Last-Event-ID` automatically and the server replays only entries that came after that point. Proxy-forced reconnects (e.g. Varnish/Fastly ~10 s idle timeout) no longer produce duplicate rows.
- **SSE never recovered after HTTP errors (503, 404, etc.)** — the browser's built-in `EventSource` auto-reconnect only handles dropped connections, not non-200 HTTP responses. Added a manual reconnect in `Panel.tsx` with exponential backoff (1 s → 30 s cap) triggered when `readyState === CLOSED` on error.
- **Varnish/Fastly first-byte timeout** — the SSE handler now sends a `: connected` comment immediately when the stream opens, satisfying proxies that enforce a first-byte timeout before any real data or heartbeat arrives.
- **Double active border on tab indicator in shadcn projects** — the built-in `::after` pseudo-element active indicator in `TabsTrigger` conflicted with the CSS `box-shadow: inset 0 -2px` approach used by the panel. Removed the `::after` classes to prevent the double line.

### Improved

- **SSE heartbeat reduced from 15 s to 8 s** — stays below common proxy idle timeouts (Varnish/Fastly typically close idle connections around 10 s), reducing unexpected reconnects.

### Internal

- `BODY_LIMIT` is now exported from `store.ts` alongside `BUFFER_SIZE`, making it a single source of truth shared by `patch.ts` and `interceptor.ts`.

---

## [0.4.3] — 2026-06-12

### Fixed

- **Duplicate entries from double-patching** — if `registerDevPanel()` was called more than once (e.g. HMR re-running `instrumentation.ts` in development), `globalThis.fetch` was patched twice and every request generated two entries with distinct IDs, which client-side deduplication could not catch. A `__nfp` flag is now set on the patched function so subsequent calls are a no-op.

- **Same-ID entries appearing twice in the panel** — `seenIdsRef` is an O(1) fast-path but can miss duplicates if the ref is in a transitional state (e.g. React Strict Mode's simulated remount). A `prev.some()` guard inside the `setEntries` updater now ensures the same entry ID can never appear twice in state regardless of how the entry arrived.

---

## [0.4.2] — 2026-06-12

### Fixed

- **Duplicate entries on SSE reconnect** — when the SSE connection was interrupted and re-established (e.g. proxy or load-balancer timeout), the server-side buffer replay re-delivered entries the client had already displayed, causing duplicates in the panel. Fixed with a `seenIdsRef` Set in `Panel.tsx` that tracks received entry IDs and discards re-delivered entries before they reach React state (O(1) lookup per entry).

### Improved

- **SSE keepalive heartbeat** — the SSE handler now sends an SSE comment (`: ping`) every 15 seconds. Proxies and load balancers close idle connections when no data flows; the heartbeat prevents spurious reconnects in self-hosted and cloud deployments without any client-side changes.

### Internal

- `BUFFER_SIZE` is now exported from `store.ts` and imported by `Panel.tsx`, replacing the previously separate `MAX_ENTRIES = 100` constant. The server buffer cap and the client display cap are now guaranteed to stay in sync.

---

## [0.4.1] — 2026-06-12

### Fixed

- **Session isolation regression** — when a project's middleware matcher excluded `/api/*` routes, the SSE endpoint never received the `x-dev-sid` header, causing all sessions to share the same `null` session ID and see each other's requests. The fix adds a dual mechanism: the `__dev_sid` cookie (now non-`httpOnly`) is read directly as a fallback in `patch.ts`, `interceptor.ts`, and `route.ts` whenever the header is absent. `Panel.tsx` also creates the cookie client-side before the `EventSource` connection opens, guaranteeing a session ID even when middleware is not configured. A null guard in the SSE handler prevents `null === null` from leaking entries across sessions.

---

## [0.4.0] — 2026-06-11

### Added

- **Drag-to-resize sheet panel** — a thin handle at the open edge of the sheet lets you resize the panel live. Bottom/top sheets resize height; left/right sheets resize width. Size is automatically persisted to `localStorage`.
- **`useDevNetworkPanel()` hook** — returns `{ isOpen, open, close, toggle }` for programmatic control of the panel from any client component. All four values are stable references.
- **`showToggleButton` prop** — pass `showToggleButton={false}` to `<DevNetworkPanel>` to hide the default floating button when providing a custom trigger.
- **`buttonPosition` prop** — controls where the default toggle button is rendered. Six positions: `bottom-right` (default), `bottom-center`, `bottom-left`, `top-right`, `top-center`, `top-left`. In fixed panel mode, the panel container anchors to the same edge.
- **`enabled` option on all entry points** — pass `enabled: false` to `registerDevPanel`, `withDevPanel`, `createDevPanelRoute`, `createDevPanelAxiosInterceptors`, or `<DevNetworkPanel>` to make that layer a complete no-op. Useful for disabling the panel in production via `process.env.NODE_ENV`.

### Removed

- Width and height inputs from the Settings dialog — the drag handle replaces them.

### Improved

- Detail pane tabs (General / Headers / Payload / Response) now have a clear active indicator: a 2 px underline and stronger text contrast between active and inactive tabs.

---

## [0.3.0] — 2026-05-XX

### Added

- **Filter bar** — a search input above the request table for filtering entries by URL, method, or status code in real time.

---

## [0.2.0]

### Added

- Style isolation — panel styles are fully self-contained and no longer depend on the consumer's Tailwind setup.
- Configurable redaction per entry point.

## [0.1.1]

- Initial public release.
