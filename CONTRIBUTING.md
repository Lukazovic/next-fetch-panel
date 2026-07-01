# Contributing to next-fetch-panel

Thanks for your interest in contributing! This document covers how to get set up, what's expected, and how to submit changes.

## Getting started

```bash
git clone https://github.com/Lukazovic/next-fetch-panel.git
cd next-fetch-panel
npm install
npm run fixture:install   # install deps for the E2E fixture app
npm run playwright:install # install Playwright browsers
```

## Development workflow

This project follows a strict TDD approach. **Write the test first, then implement.**

1. Write or update the test — describe the expected behavior before touching the implementation
2. Run the relevant test file to confirm it fails for the right reason
3. Implement the change until the test passes
4. Run the full suite to confirm no regressions
5. Run typecheck before opening a PR

```bash
npm test                          # full unit + integration suite (Vitest)
npm run test:watch                # watch mode during development
npx vitest run src/foo.test.ts    # single file
npm run typecheck                 # tsc --noEmit
npm run build && npm run test:e2e # E2E tests (Playwright)
```

**A PR is not ready if tests are failing or `npm run typecheck` reports errors.**

## Test layers

| Layer       | Runner       | When to add                                     |
| ----------- | ------------ | ----------------------------------------------- |
| Unit        | Vitest       | Pure functions, new helpers, store logic        |
| Integration | Vitest       | Modules wired together, Next.js APIs mocked     |
| UI          | Vitest + RTL | New Panel behavior, interactions, state changes |
| E2E         | Playwright   | Full-stack flows requiring a real browser       |

Prefer unit and integration tests over E2E. Only reach for Playwright when the behavior genuinely requires a running Next.js server.

## Code conventions

- **TypeScript strict mode** — no `as any` outside of documented test utilities
- **Named types** — always extract inline object types in function/component signatures to named `type` declarations; never leave object types inline (e.g. `type MyProps`, not `{ foo: string }` inline)
- **No comments for what** — only add a comment when the _why_ is non-obvious (hidden constraint, workaround for a specific bug)
- **Named callbacks** — extract inline `(e: T) => { ... }` block-body callbacks to named functions at module scope
- **No magic values** — every inline literal that carries meaning must be a named constant

## Submitting a pull request

1. Fork the repository and create a branch from `main`
2. Follow the TDD workflow above
3. Ensure `npm test`, `npm run typecheck`, and `npm run lint` all pass
4. Open a PR with a clear title and description explaining _why_ the change is needed
5. Link any related issues

## Reporting bugs

Open an issue at https://github.com/Lukazovic/next-fetch-panel/issues with:

- Next.js version, React version, and package version
- A minimal reproduction (ideally a repo or StackBlitz link)
- What you expected vs. what happened

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
