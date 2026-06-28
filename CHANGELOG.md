# Changelog

## [0.6.1] — 2026-06-28 (internal)

### Internal

- **Module split** — `src/panel/Panel.tsx` is now a thin orchestrator. UI split into `PanelInner`, `DetailPanel`, `SettingsDialog`, `ResizeHandles`, and `OptionButton` components.
- **`components/ui/`** — shadcn/base-ui primitives moved from `components/` to `components/ui/` to separate vendor primitives from custom components.
- **`cn.ts`** — `utils.ts` renamed to `cn.ts`; internal imports updated to `"../cn"` and `"../../cn"`.
- **`panel.config.ts` / `panel.constants.ts`** — config types and UI constants extracted from `Panel.tsx` into dedicated modules; theme class strings (`THEME_CLASS_LIGHT`, `THEME_CLASS_DARK`), `buildThemeClass`, `PANEL_STYLES_ID`, and numeric constants (`SHEET_MAX_SIZE_FRACTION`, `SHEET_MIN_SIZE_PX`, `DURATION_BAR_MAX_MS`, `DETAIL_PANEL_ID`) added.
- **`hooks/`** — `usePanelConfig` and `useEffectiveTheme` extracted to `panel/hooks/`.
- **`helpers/`** — pure display functions (`formatters.ts`) and DOM side effects (`downloads.ts`) extracted to `panel/helpers/`; HTTP helpers (`normalizeHeaders`, `stringify`, `wasTruncated`, `extractRequestBody`) extracted to `capture/helpers/http.ts`.
- **`domain/routes.ts`** — `DEV_NETWORK_ROUTE = "/api/dev-network"` centralized; consumed by `fetch-patch.ts` and `Panel.tsx`.
- **Named anonymous concepts** — `useSyncExternalStore` lambdas extracted to named module-level functions (`noopSubscribe`, `getClientMounted`, `getServerMounted`, `getPanelClosedOnServer`); magic panel ID string `"detail"` → `DETAIL_PANEL_ID`.

No public API changes. `DevNetworkPanel`, `useDevNetworkPanel`, `ButtonPosition`, `LogEntry` — all public exports — remain identical.

---

## [0.6.0] — 2026-06-18

### Added

- **Fixed modal resizable from all four edges** — the fixed modal now has drag handles on every edge (top, bottom, left, right), matching the resize UX of sheet mode. Previously only the sheet had drag-to-resize; the fixed modal required typing pixel values in a settings dialog. The new handles use `getBoundingClientRect()` so the math is accurate regardless of which corner the panel is anchored at. Size is still saved to `localStorage` and restored on the next page load.
- **Snapshot endpoint for test automation** — `GET /api/dev-network/snapshot` returns the current log buffer for the caller's session as `{ entries: LogEntry[] }`. Useful for CI pipelines: call it in test teardown and save the JSON as an artifact. Supports the same `guard` and `enabled` options as the SSE route.
  - Simple setup: `export { dynamic, GET_SNAPSHOT as GET } from "next-fetch-panel/route"`
  - Composable: `createDevPanelSnapshot({ guard, enabled })`

### Removed

- **Width / height inputs from the Settings dialog (fixed mode)** — replaced by drag-to-resize on all four edges. The underlying `width` and `height` config values are unchanged and still persisted to `localStorage`.

---

## [0.5.1] — 2026-06-18

### Fixed

- **Scroll leaking to the page** — scrolling inside the panel no longer propagates to the page when the request list reaches the top or bottom of the scroll area (`overscroll-behavior: contain`).
- **Request list auto-scrolling while browsing** — new entries no longer force the list to jump to the bottom when the user has scrolled up to review earlier requests. Auto-scroll resumes automatically once the user scrolls back within 100 px of the bottom.

---

## [0.5.0] — 2026-06-17

### Added

- **Actions dropdown in request table** — each row now has a ⋯ button that opens a per-entry menu:
  - **Copy as cURL** — copies a ready-to-run `curl` command (method, URL, headers, body with single-quote escaping) to the clipboard. The trigger icon briefly turns green to confirm.
  - **Download response body** — saves the captured response body as `.json` or `.txt`. Only shown when a response body was captured.
  - **Download request body** — saves the captured request body as `.json` or `.txt`. Only shown when a request body was captured and is not binary.
  - **Download full request data** — saves the complete `LogEntry` as a `.json` file (URL, method, status, headers, both bodies, timing, session metadata).
- **Truncation notices in the General tab** — when a body was cut off at capture time, a yellow warning now appears in the General tab (before the URL field) with approximate sizes and a prompt to increase `bodyLimit`. Detection happens server-side at capture time, so the notice is accurate regardless of the configured `bodyLimit` value.
- **Render gate for large bodies** — bodies at or above `BODY_LIMIT` (50 KB) in the Payload and Response tabs are no longer rendered immediately. A warning shows the body size and offers two options: **Render anyway** (accepts the risk of a slow render) and **Download** (saves the body without touching the DOM). The gate resets automatically when a different entry is selected.
- **`requestBodyTruncated` / `responseBodyTruncated` on `LogEntry`** — boolean flags set server-side at capture time. `true` when the body was cut off at `bodyLimit`. Available to external consumers of the SSE stream.

### Fixed

- **Truncation warning showed wrong limit** — the previous client-side check compared `body.length` against a constant, causing false positives when `bodyLimit` was configured larger than the default and the full body was captured. Detection is now done server-side via the new flags.
- **`BODY_LIMIT` default reverted to 50 KB** — the 0.4.4 release raised it to 100 KB, which caused UI freezes when rendering large bodies. The default is back to `50_000`. Projects that need larger captures can opt in via `bodyLimit`.
- **`content-length` NaN edge case** — the truncation notice no longer renders "NaN B" if the `content-length` response header contains a non-numeric value.
- **Copied-state timer leak** — the 1.5 s "green check" feedback timer in the cURL copy button is now cancelled if the row unmounts before it fires.

### Internal

- New `src/ui/dropdown-menu.tsx` — wrapper around `@base-ui/react/menu`, following the same pattern as the other `src/ui/` components.
- `PanelThemeContext` — React context that propagates the active theme class to portal-rendered components (the dropdown popup) without prop drilling.
- `extractRequestBody` in `patch.ts` now returns `{ body, truncated }` instead of `string | null`.
- `wasTruncated(result, bodyLimit)` helper in `interceptor.ts` — avoids calling `stringify()` twice to compute the truncation flag.

---

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
