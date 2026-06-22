import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  transpilePackages: ["next-fetch-panel"],
  turbopack: {
    // Turbopack detects multiple lockfiles (repo root + fixture) and picks the wrong one.
    // Set root explicitly so it resolves node_modules from this directory.
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
