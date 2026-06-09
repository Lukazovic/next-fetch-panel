import { defineConfig } from "tsup";

const external = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "next",
  "next/headers",
  "next/server",
  "@base-ui/react",
  "@base-ui/react/button",
  "@base-ui/react/dialog",
  "@base-ui/react/separator",
  "@base-ui/react/scroll-area",
  "@base-ui/react/tabs",
  "@base-ui/react/merge-props",
  "@base-ui/react/use-render",
  "react-resizable-panels",
  "lucide-react",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
];

export default defineConfig([
  // Client bundle — Panel component + LogEntry type
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    splitting: true,
    clean: true,
    external,
    banner: { js: '"use client";' },
  },
  // Server-side bundles — no "use client"
  {
    entry: {
      patch: "src/patch.ts",
      middleware: "src/middleware.ts",
      route: "src/route.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    external,
  },
]);
