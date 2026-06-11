# Changelog

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
