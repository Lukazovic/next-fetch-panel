# Agent guidelines — next-fetch-panel

## TDD workflow

All code changes must be accompanied by tests. The order matters:

1. **Write or update the test first** — describe the expected behavior before touching the implementation.
2. **Run the relevant test file** to confirm it fails for the right reason.
3. **Implement the change** until the test passes.
4. **Run the full test suite** to confirm nothing regressed.
5. **Run typecheck** before considering the task done.

Never mark a task complete if tests are failing or if `npm run typecheck` reports errors.

## Commands

```bash
npm test                        # all unit / integration / UI tests (Vitest)
npm run test:watch              # watch mode — use during active development
npx vitest run src/foo.test.ts  # run a single file fast
npm run typecheck               # tsc --noEmit on src/ + playwright/
npm run test:e2e                # Playwright E2E (requires npm run build first)
```

## Test layers

| Layer       | Runner       | Location                 | When to add tests                                 |
| ----------- | ------------ | ------------------------ | ------------------------------------------------- |
| Unit        | Vitest       | `src/*.test.ts`          | Pure functions, new helpers, store logic          |
| Integration | Vitest       | `src/*.test.ts`          | Modules wired together, Next.js APIs mocked       |
| UI          | Vitest + RTL | `src/Panel.test.tsx`     | New Panel behavior, interactions, state changes   |
| E2E         | Playwright   | `playwright/e2e.spec.ts` | Full-stack flows, SSE streaming, browser behavior |

Prefer unit and integration tests over E2E. Only reach for E2E when the behavior genuinely requires a real browser and a running Next.js server.

## What to test for each type of change

| Change                                                    | Required tests                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| New function in `store.ts`, `redact.ts`, `panel-state.ts` | Unit test in the corresponding `*.test.ts`                             |
| Change to `patch.ts` or `interceptor.ts`                  | Integration test: push a fake fetch/axios call, assert the store entry |
| Change to `route.ts`                                      | Integration test: SSE stream or snapshot response shape                |
| Change to `middleware.ts`                                 | Integration test: cookie/header behavior via `MockNextRequest`         |
| New Panel UI behavior                                     | RTL test in `Panel.test.tsx` using `pushEntry` / `openPanel` helpers   |
| Full-stack flow (SSE, session isolation, cookies)         | Playwright test in `playwright/e2e.spec.ts`                            |

## Existing test infrastructure

- **`src/Panel.test.tsx`** — `renderPanel()`, `openPanel()`, `pushEntry()`, `makeEntry()` helpers are already defined. Reuse them.
- **`src/route.test.ts`** — `makeEntry()` and `devLogStore` are imported; `vi.useFakeTimers()` is available for SSE timing tests.
- **`src/middleware.test.ts`** — `MockNextRequest` accepts `{ cookieJar: Record<string, string> } as any` to simulate cookies.
- **Playwright** — `openPanel()`, `entryRows()`, `waitForEntry()` helpers are in `playwright/e2e.spec.ts`. Reuse them.

## Mock discipline

Mock only what you cannot control — external boundaries, not your own code.

| Mock                                    | Reason                                                     |
| --------------------------------------- | ---------------------------------------------------------- |
| `next/headers`, `next/server`           | Next.js server APIs not available in Node test environment |
| `EventSource`                           | Browser API not available in jsdom                         |
| `navigator.clipboard`, `scrollIntoView` | Browser APIs not available in jsdom                        |
| `globalThis.fetch` (in `patch.test.ts`) | The patch itself replaces fetch — use a real fake response |

Do **not** mock `devLogStore`, `panelState`, or `redactEntry`. These are pure in-process modules — test them through real calls so the integration is actually verified. If you find yourself mocking internal modules to make a test pass, the test is probably testing the wrong thing.

## Anti-patterns to avoid

- **Weakening assertions to make tests pass** — `expect(x).toBeDefined()` instead of `expect(x).toBe("expected-value")` hides bugs.
- **Skipping or commenting out failing tests** — fix the code or the test; never `.skip` to unblock.
- **Testing that mocks return what they were told to return** — that tests nothing. Assert on observable side effects (store entries, headers, rendered UI).
- **Using `as any` to silence TypeScript** — the only accepted use is `MockNextRequest` cookie init (documented in `middleware.test.ts`). If you need `as any` elsewhere, something is wrong with the types.
- **Deleting tests to increase the pass rate** — the CI enforces the full suite; removed tests will be noticed in review.
- **Adding tests after the fact that only pass** — run the test before the implementation to confirm it actually fails first.

## Definition of done

A change is done when:

- [ ] The relevant tests pass (`npm test`)
- [ ] No new TypeScript errors (`npm run typecheck`)
- [ ] No existing tests were removed or weakened to make things pass
- [ ] E2E tests pass if the change affects SSE, session handling, middleware, or the Panel's live behavior (`npm run build && npm run test:e2e`)
