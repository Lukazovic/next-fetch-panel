import { defineConfig } from "vitest/config";

// Node 25+ exposes its own localStorage global, which is undefined without
// --localstorage-file and shadows jsdom's implementation in UI tests.
// The flag only exists from Node 22, so older versions must not receive it.
const NODE_WEBSTORAGE_GLOBAL_MAJOR = 25;
const nodeMajor = Number(process.versions.node.split(".")[0]);
const execArgv = nodeMajor >= NODE_WEBSTORAGE_GLOBAL_MAJOR ? ["--no-experimental-webstorage"] : [];

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    execArgv,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/ui/**",
        "src/panel.styles.ts",
        "src/utils.ts",
        "src/*.test.ts",
        "src/*.test.tsx",
      ],
    },
  },
});
