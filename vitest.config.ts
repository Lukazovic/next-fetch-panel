import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/ui/**", "src/panel.styles.ts", "src/utils.ts", "src/*.test.ts", "src/*.test.tsx"],
    },
  },
});
