import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["next-fetch-panel"],
  // Silences the "multiple lock files" warning from webpack's file tracer.
  // The fixture lives inside the library repo, so two lock files exist.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
