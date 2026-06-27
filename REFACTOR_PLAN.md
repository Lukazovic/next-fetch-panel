# Refactor Plan: Source Structure Reorganization

## Goal

Reorganize `src/` from a flat list of files into a layered structure with clear domain
boundaries. The public API surface, tsup entry points, and all test coverage stay identical.
No behavior changes in any step.

---

## Proposed Structure

```
src/
├── domain/                        Pure types and logic — zero internal dependencies
│   ├── log-entry.ts               LogEntry type, factory, constants (BUFFER_SIZE, BODY_LIMIT)
│   ├── session.ts                 SessionId type, SESSION_COOKIE and SESSION_HEADER constants
│   └── redaction/
│       ├── config.ts              RedactConfig, RedactInput, defaultRedactConfig
│       └── redact.ts              resolveRedactConfig(), redactEntry() — pure functions
│
├── store/                         In-memory state — depends only on domain/
│   ├── log-store.ts               Circular buffer, pub/sub, globalThis singleton
│   └── panel-state.ts             Panel open/close external store (useSyncExternalStore)
│
├── capture/                       HTTP capture adapters — depends on domain/ + store/
│   ├── fetch-patch.ts             globalThis.fetch wrapper (registerDevPanel)
│   └── axios-interceptor.ts       Axios request/response/error interceptors
│
├── server/                        Next.js server integrations — depends on domain/ + store/
│   ├── middleware.ts              Session cookie/header (withDevPanel)
│   └── route.ts                   SSE stream + snapshot endpoint
│
├── panel/                         React presentation layer
│   ├── Panel.tsx                  DevNetworkPanel component
│   ├── panel.css                  Tailwind v4 CSS source
│   ├── panel.styles.ts            Generated CSS string (build artifact, git-ignored)
│   └── components/                Headless UI primitives (Base UI wrappers)
│       ├── badge.tsx
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── label.tsx
│       ├── resizable.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       └── tabs.tsx
│
├── utils.ts                       cn() — shared across layers, no internal deps
├── test-setup.ts                  Vitest setup (stays at src/ root)
└── index.ts                       Public API surface (unchanged)
```

---

## Dependency Rule

The arrows below show allowed import directions. A layer may only import from layers to its left.

```
domain/  <--  store/  <--  capture/
                       <--  server/
domain/  <--  panel/
utils    <--  (any layer)
```

`domain/` imports nothing internal. Every other layer imports only from layers closer to
the domain. `panel/` never imports from `capture/` or `server/`, and vice versa.

---

## TDD Approach for Refactoring

Refactoring under TDD means the existing test suite is the spec. The red-green loop
changes shape depending on whether the step has an existing test file or introduces new logic.

### Type A — Move existing module + its test (Steps 3, 4, 5, 6, 7)

The test travels first. Moving the test to the new path while the implementation stays at
the old path creates a genuine red state: the test fails because the import can't resolve.
Moving the implementation then turns it green.

```
1. Move test file to new path, update its imports to the new module path
2. npx vitest run <new-test-path>   → expect FAIL (module not found)
3. Move implementation file to new path, update its internal imports
4. npx vitest run <new-test-path>   → expect PASS
5. npm test                         → all 146 pass
6. npm run typecheck                → clean
```

### Type B — New domain module without prior test (Step 2)

No existing test file means we write one from scratch before creating the module.
The test file is committed before the module exists.

```
1. Write src/domain/session.test.ts — import and assert constants
2. npx vitest run src/domain/session.test.ts   → expect FAIL (module not found)
3. Create src/domain/session.ts
4. npx vitest run src/domain/session.test.ts   → expect PASS
5. Update consumers, npm test → all pass, npm run typecheck → clean
```

### Type C — Pure type/constant extraction with no dedicated test (Step 1 — done)

The existing 146 tests are the spec. Verify they pass before and after the move.
No new test is written because there is no runtime behavior to assert.

```
1. npm test   → 146 pass (baseline)
2. Create domain file, update imports in consumers
3. npm test   → 146 pass (green)
4. npm run typecheck → clean
```

---

## Step-by-Step Plan

Each step leaves the full test suite, typecheck, and lint green before moving on.
Steps are ordered by dependency direction (innermost layer first).

---

### Step 1 — Extract `LogEntry` to `domain/log-entry.ts` ✅ DONE

**Type:** C (pure type extraction, no dedicated test)

**Why first:** `LogEntry` is the central type of the entire library. Every other layer
references it. Moving it out of `store.ts` gives it a home that has no internal
dependencies, which is the correct semantic.

**TDD sequence:**

```bash
npm test                              # baseline: 146 pass
# create domain/log-entry.ts, update imports in store.ts, redact.ts, Panel.tsx, index.ts
npm test                              # still 146 pass (green)
npm run typecheck                     # clean
```

**What changed:**

| Action  | Detail                                                        |
| ------- | ------------------------------------------------------------- |
| Created | `src/domain/log-entry.ts`                                     |
| Updated | `src/store.ts` — imports from domain, re-exports for compat   |
| Updated | `src/redact.ts`, `src/Panel.tsx`, `src/index.ts` — new import |

**Commit message:**

```
refactor(domain): extract LogEntry type and buffer constants to domain/log-entry
```

---

### Step 2 — Extract session constants to `domain/session.ts`

**Type:** B (new domain module, write test first)

**Why:** The strings `"__dev_sid"` and `"x-dev-sid"` appear in `middleware.ts`, `route.ts`,
and `Panel.tsx` as string literals. A single source of truth in the domain layer eliminates
drift and makes intent explicit.

**TDD sequence:**

```bash
# 1. Write src/domain/session.test.ts — assert constant values
npx vitest run src/domain/session.test.ts   # FAIL: Cannot find module

# 2. Create src/domain/session.ts
npx vitest run src/domain/session.test.ts   # PASS

# 3. Update consumers to import from domain/session
npm test                                    # all 146 pass
npm run typecheck                           # clean
```

`src/domain/session.test.ts` to write:

```ts
import { SESSION_COOKIE, SESSION_HEADER } from "./session";

test("SESSION_COOKIE matches the literal used in middleware and Panel", () => {
  expect(SESSION_COOKIE).toBe("__dev_sid");
});

test("SESSION_HEADER matches the literal used in route and middleware", () => {
  expect(SESSION_HEADER).toBe("x-dev-sid");
});
```

`src/domain/session.ts` to create:

```ts
export type SessionId = string;

export const SESSION_COOKIE = "__dev_sid";
export const SESSION_HEADER = "x-dev-sid";
```

**What changes:**

| Action         | Detail                                               |
| -------------- | ---------------------------------------------------- |
| Write test     | `src/domain/session.test.ts`                         |
| Create         | `src/domain/session.ts`                              |
| Update imports | `src/middleware.ts`, `src/route.ts`, `src/Panel.tsx` |

**Commit message:**

```
refactor(domain): centralize session constants and SessionId type in domain/session
```

---

### Step 3 — Move redaction logic to `domain/redaction/`

**Type:** A (move module + test, test travels first)

**Why:** Redaction is the only layer that is already pure — no side effects, no I/O. It
belongs in the domain. Splitting it into `config.ts` (types + defaults) and `redact.ts`
(functions) makes each file's responsibility clear at a glance.

**TDD sequence:**

```bash
# 1. Move test and update its imports to the new path
mv src/redact.test.ts src/domain/redaction/redact.test.ts
# update import inside: "./redact" → "./redact" (same relative, works from new dir)
# also update: "from "../store"" → "from "../log-entry""
npx vitest run src/domain/redaction/redact.test.ts  # FAIL: Cannot find module

# 2. Create src/domain/redaction/config.ts and src/domain/redaction/redact.ts
#    Delete src/redact.ts
#    Update src/patch.ts and src/interceptor.ts imports
npx vitest run src/domain/redaction/redact.test.ts  # PASS

npm test                              # all 146 pass
npm run typecheck                     # clean
```

**What changes:**

| Action         | Detail                                                       |
| -------------- | ------------------------------------------------------------ |
| Move test      | `src/redact.test.ts` → `src/domain/redaction/redact.test.ts` |
| Create         | `src/domain/redaction/config.ts`                             |
| Create         | `src/domain/redaction/redact.ts`                             |
| Delete         | `src/redact.ts`                                              |
| Update imports | `src/patch.ts`, `src/interceptor.ts`                         |

`config.ts` receives: `RedactConfig`, `RedactInput`, `defaultRedactConfig`
`redact.ts` receives: `resolveRedactConfig()`, `redactEntry()`

The import inside the new `redact.ts` changes from:

```ts
// before (src/redact.ts)
import type { LogEntry } from "./store";

// after (src/domain/redaction/redact.ts)
import type { LogEntry } from "../log-entry";
```

**Commit message:**

```
refactor(domain): move redaction logic to domain/redaction, split config from functions
```

---

### Step 4 — Move store layer to `store/`

**Type:** A (move modules + tests, tests travel first)

**Why:** `store.ts` and `panel-state.ts` are stateful but have no I/O. They sit between
the domain (types) and the infrastructure (network, Next.js). Giving them their own folder
makes the distinction between "pure domain" and "stateful but in-process" explicit.

**TDD sequence:**

```bash
# 1. Move tests and update their imports
mv src/store.test.ts src/store/log-store.test.ts
mv src/panel-state.test.ts src/store/panel-state.test.ts
# update imports inside both test files to new module paths
npx vitest run src/store/log-store.test.ts src/store/panel-state.test.ts  # FAIL

# 2. Move implementations
mv src/store.ts src/store/log-store.ts
mv src/panel-state.ts src/store/panel-state.ts
# update internal imports in both files
# update consumers: patch.ts, interceptor.ts, route.ts, Panel.tsx, index.ts
npx vitest run src/store/log-store.test.ts src/store/panel-state.test.ts  # PASS

npm test                              # all 146 pass
npm run typecheck                     # clean
```

**What changes:**

| Action         | Detail                                                                                |
| -------------- | ------------------------------------------------------------------------------------- |
| Move test      | `src/store.test.ts` → `src/store/log-store.test.ts`                                   |
| Move test      | `src/panel-state.test.ts` → `src/store/panel-state.test.ts`                           |
| Move           | `src/store.ts` → `src/store/log-store.ts`                                             |
| Move           | `src/panel-state.ts` → `src/store/panel-state.ts`                                     |
| Update imports | `src/patch.ts`, `src/interceptor.ts`, `src/route.ts`, `src/Panel.tsx`, `src/index.ts` |

`log-store.ts` imports `LogEntry`, `BUFFER_SIZE`, `BODY_LIMIT` from `../domain/log-entry`.

**Commit message:**

```
refactor(store): move log-store and panel-state into store/ layer
```

---

### Step 5 — Move HTTP capture adapters to `capture/`

**Type:** A (move modules + tests, tests travel first)

**Why:** `patch.ts` and `interceptor.ts` are adapters — they translate between external I/O
(fetch API, axios) and the internal store. Infrastructure adapters belong in their own
layer, separate from the business logic they feed.

**TDD sequence:**

```bash
# 1. Move tests and update imports
mv src/patch.test.ts src/capture/fetch-patch.test.ts
mv src/interceptor.test.ts src/capture/axios-interceptor.test.ts
# update import paths inside both test files
npx vitest run src/capture/fetch-patch.test.ts src/capture/axios-interceptor.test.ts  # FAIL

# 2. Move implementations and update tsup config
mv src/patch.ts src/capture/fetch-patch.ts
mv src/interceptor.ts src/capture/axios-interceptor.ts
# update internal imports in both files
# update tsup.config.ts entry paths
npx vitest run src/capture/fetch-patch.test.ts src/capture/axios-interceptor.test.ts  # PASS

npm test                              # all 146 pass
npm run typecheck                     # clean
```

**What changes:**

| Action    | Detail                                                              |
| --------- | ------------------------------------------------------------------- |
| Move test | `src/patch.test.ts` → `src/capture/fetch-patch.test.ts`             |
| Move test | `src/interceptor.test.ts` → `src/capture/axios-interceptor.test.ts` |
| Move      | `src/patch.ts` → `src/capture/fetch-patch.ts`                       |
| Move      | `src/interceptor.ts` → `src/capture/axios-interceptor.ts`           |
| Update    | `tsup.config.ts` — entry paths                                      |

`tsup.config.ts` diff:

```ts
// before
patch: "src/patch.ts",
interceptor: "src/interceptor.ts",

// after
patch: "src/capture/fetch-patch.ts",
interceptor: "src/capture/axios-interceptor.ts",
```

The tsup entry keys (`patch`, `interceptor`) stay the same — compiled output names
(`dist/patch.js`, `dist/interceptor.js`) and public import paths
(`next-fetch-panel/patch`, `next-fetch-panel/interceptor`) are unchanged.

**Commit message:**

```
refactor(capture): move fetch-patch and axios-interceptor into capture/ layer
```

---

### Step 6 — Move Next.js server integrations to `server/`

**Type:** A (move modules + tests, tests travel first)

**Why:** `middleware.ts` and `route.ts` are Next.js-specific infrastructure — they speak the
Next.js Edge/Node.js API surface (`NextRequest`, `NextResponse`, SSE). Grouping them under
`server/` makes it immediately obvious what runtime they target.

**TDD sequence:**

```bash
# 1. Move tests and update imports
mv src/middleware.test.ts src/server/middleware.test.ts
mv src/route.test.ts src/server/route.test.ts
# update import paths inside both test files
npx vitest run src/server/middleware.test.ts src/server/route.test.ts  # FAIL

# 2. Move implementations and update tsup config
mv src/middleware.ts src/server/middleware.ts
mv src/route.ts src/server/route.ts
# update internal imports in both files
# update tsup.config.ts entry paths
npx vitest run src/server/middleware.test.ts src/server/route.test.ts  # PASS

npm test                              # all 146 pass
npm run typecheck                     # clean
```

**What changes:**

| Action    | Detail                                                     |
| --------- | ---------------------------------------------------------- |
| Move test | `src/middleware.test.ts` → `src/server/middleware.test.ts` |
| Move test | `src/route.test.ts` → `src/server/route.test.ts`           |
| Move      | `src/middleware.ts` → `src/server/middleware.ts`           |
| Move      | `src/route.ts` → `src/server/route.ts`                     |
| Update    | `tsup.config.ts` — entry paths                             |

`tsup.config.ts` diff:

```ts
// before
middleware: "src/middleware.ts",
route: "src/route.ts",

// after
middleware: "src/server/middleware.ts",
route: "src/server/route.ts",
```

**Commit message:**

```
refactor(server): move middleware and route handlers into server/ layer
```

---

### Step 7 — Move UI layer to `panel/`

**Type:** A (move module + test, test travels first)

**Why:** Everything that touches the browser (React component, styles, UI primitives) lives
in `src/Panel.tsx`, `src/panel.styles.ts`, and `src/ui/`. Moving them under `src/panel/`
groups the entire presentation layer in one place and separates it clearly from server-side
modules.

**TDD sequence:**

```bash
# 1. Move Panel test and update its imports
mv src/Panel.test.tsx src/panel/Panel.test.tsx
# update import: "./Panel" → "./Panel" (same relative, works from new dir)
# update import: "./store" → "../store/log-store" (if any)
npx vitest run src/panel/Panel.test.tsx  # FAIL

# 2. Move Panel.tsx and all ui/ components, update internal imports and configs
mv src/Panel.tsx src/panel/Panel.tsx
mv src/panel.styles.ts src/panel/panel.styles.ts
mv src/panel.css src/panel/panel.css
mv src/ui/ src/panel/components/
# update internal imports in Panel.tsx
# update src/index.ts import for Panel
# update eslint.config.js ignores
# update package.json build:css script
# update scripts/build-css.mjs paths
# update .gitignore entries
npx vitest run src/panel/Panel.test.tsx  # PASS

npm test                              # all 146 pass
npm run typecheck                     # clean
```

**What changes:**

| Action    | Detail                                               |
| --------- | ---------------------------------------------------- |
| Move test | `src/Panel.test.tsx` → `src/panel/Panel.test.tsx`    |
| Move      | `src/Panel.tsx` → `src/panel/Panel.tsx`              |
| Move      | `src/panel.styles.ts` → `src/panel/panel.styles.ts`  |
| Move      | `src/panel.css` → `src/panel/panel.css`              |
| Move      | `src/ui/*` → `src/panel/components/*` (all 10 files) |
| Update    | `src/panel/Panel.tsx` — internal imports             |
| Update    | `src/index.ts` — import Panel from `./panel/Panel`   |
| Update    | `eslint.config.js` — two path changes (see below)    |
| Update    | `package.json` `build:css` script — CSS input path   |
| Update    | `scripts/build-css.mjs` — CSS output path            |

Internal import changes inside `Panel.tsx`:

```ts
// before
import { cn } from "./utils";
import panelStyles from "./panel.styles";
import { Button } from "./ui/button";

// after
import { cn } from "../utils";
import panelStyles from "./panel.styles";
import { Button } from "./components/button";
```

`eslint.config.js` ignores diff:

```js
// before
ignores: ["dist/**", "coverage/**", "fixtures/**", "src/ui/**", "src/panel.styles.ts"],

// after
ignores: ["dist/**", "coverage/**", "fixtures/**", "src/panel/components/**", "src/panel/panel.styles.ts"],
```

`package.json` `build:css` script diff:

```json
// before
"build:css": "tailwindcss -i src/panel.css -o src/panel.styles.tmp.css --minify && node scripts/build-css.mjs"

// after
"build:css": "tailwindcss -i src/panel/panel.css -o src/panel/panel.styles.tmp.css --minify && node scripts/build-css.mjs"
```

`scripts/build-css.mjs` input/output paths update from `src/panel.styles.tmp.css` and
`src/panel.styles.ts` to `src/panel/panel.styles.tmp.css` and `src/panel/panel.styles.ts`.

`.gitignore` update — swap the two CSS artifact entries:

```
# before
src/panel.styles.ts
src/panel.styles.tmp.css

# after
src/panel/panel.styles.ts
src/panel/panel.styles.tmp.css
```

**Commit message:**

```
refactor(panel): move Panel component, styles, and UI primitives into panel/ layer
```

---

### Step 8 — Full verification pass

**Why:** With all moves complete, run every quality gate. This step produces no code changes
unless a linter or type error slipped through a previous step.

```bash
npm run build          # tsup builds all 5 entry points cleanly
npm run typecheck      # zero errors across src/ and playwright/
npm run lint           # zero ESLint errors
npm run format:check   # Prettier passes
npm test               # all 146 tests pass
npm run test:e2e       # all E2E tests pass (requires build first)
```

If all pass, no additional commit is needed. If anything surfaces:

```
chore: fix lint and import paths after layer reorganization
```

---

## DOCS.md Changes Required

### 1. Package Architecture section (lines 701-760)

Full rewrite of the `src/` tree. Replace the current flat listing with the layered
structure. The `dist/` section also needs updating — replace `.mjs`/`.js` format with
`.js`/`.cjs` (corrected in the exports map fix already done):

```
dist/
├── index.js / index.cjs / index.d.ts
├── patch.js / patch.cjs / patch.d.ts
├── middleware.js / middleware.cjs / middleware.d.ts
├── route.js / route.cjs / route.d.ts
└── interceptor.js / interceptor.cjs / interceptor.d.ts
```

### 2. Build Configuration section

Update the tsup config code example — entry paths change for the server pipeline:

```ts
// after
entry: {
  patch:       "src/capture/fetch-patch.ts",
  middleware:  "src/server/middleware.ts",
  route:       "src/server/route.ts",
  interceptor: "src/capture/axios-interceptor.ts",
},
```

### 3. Inline file references throughout

Search for every `src/` path reference and update to the new location:

| Old path              | New path                           |
| --------------------- | ---------------------------------- |
| `src/store.ts`        | `src/store/log-store.ts`           |
| `src/redact.ts`       | `src/domain/redaction/redact.ts`   |
| `src/patch.ts`        | `src/capture/fetch-patch.ts`       |
| `src/interceptor.ts`  | `src/capture/axios-interceptor.ts` |
| `src/middleware.ts`   | `src/server/middleware.ts`         |
| `src/route.ts`        | `src/server/route.ts`              |
| `src/panel-state.ts`  | `src/store/panel-state.ts`         |
| `src/Panel.tsx`       | `src/panel/Panel.tsx`              |
| `src/ui/`             | `src/panel/components/`            |
| `src/panel.styles.ts` | `src/panel/panel.styles.ts`        |

### 4. Stale section: `ES2020.Intl in tsconfig.json`

The heading and body text reference `ES2020.Intl`. This was already corrected in the tsconfig
(`ES2021.Intl` is the lib that actually contains `fractionalSecondDigits`). Update both the
section heading and the explanation.

### 5. Panel open/close state description (line 363)

Update the file reference from `src/panel-state.ts` to `src/store/panel-state.ts`.

### 6. ESLint section (line 641)

Update the description: `"src/panel.styles.ts", "fixtures/"` → `"src/panel/panel.styles.ts", "fixtures/"`.

**Commit message for DOCS update:**

```
docs: update DOCS.md to reflect new layered src/ structure
```

---

## README.md Changes Required

The README documents the library from a **consumer** perspective (wiring it up, redaction,
capture limits, etc.). None of the internal file moves affect the public API or consumer
usage. The "Development & testing" section already lists commands (`npm test`, `npm run lint`,
etc.) which stay unchanged.

Two small updates:

1. **Development & testing section** — no command changes needed. If there is a file tree
   shown anywhere, update it.
2. **No other changes required** — the README intentionally avoids internal file paths.

---

## What Does NOT Change

| Item                            | Reason                                                 |
| ------------------------------- | ------------------------------------------------------ |
| Public API (`index.ts` exports) | Same types and functions, just different import source |
| tsup entry key names            | `patch`, `middleware`, `route`, `interceptor`, `index` |
| `dist/` output files            | Same names and formats                                 |
| `package.json` `exports` map    | Already corrected, no structural change                |
| Test suite count and assertions | All tests move with their source file                  |
| E2E tests                       | No fixture or Playwright changes                       |
| AGENTS.md / CLAUDE.md           | Commands reference `npm test`, not file paths          |
