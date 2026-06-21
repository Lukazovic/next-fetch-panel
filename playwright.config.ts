import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Tests share the server, so run one worker at a time to avoid cross-test
  // session bleed through the shared in-process devLogStore.
  fullyParallel: false,
  workers: 1,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },

  // Before running tests, start the self-contained fixture app bundled with
  // the library. `reuseExistingServer` skips startup when a server is already
  // on :3000 (convenient in watch mode; disabled on CI for a fresh start).
  webServer: {
    command: 'npm run dev',
    cwd: './fixtures/nextjs-app',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
