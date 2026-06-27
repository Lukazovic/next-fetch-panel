import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "fixtures/**",
      "src/panel/components/**",
      "src/panel/panel.styles.ts",
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React hooks rules
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Project-specific overrides
  {
    rules: {
      // Allow _-prefixed vars to be unused (common for destructuring)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Warn on any — don't block, but keep visible
      "@typescript-eslint/no-explicit-any": "warn",
      // Banning interface {} / type {} is non-critical here
      "@typescript-eslint/no-empty-object-type": "warn",
      // Empty catch blocks are intentional (e.g. SSE teardown, localStorage)
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Relax rules for test files
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "playwright/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Disable all formatting rules — Prettier owns those
  prettier
);
