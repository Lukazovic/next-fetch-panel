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
      patch: "src/capture/fetch-patch.ts",
      middleware: "src/server/middleware.ts",
      route: "src/server/route.ts",
      interceptor: "src/capture/axios-interceptor.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    external,
  },
]);
