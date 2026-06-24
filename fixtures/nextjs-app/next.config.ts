import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["next-fetch-panel"],
  webpack(config) {
    // webpack follows file: symlinks to their real path by default.
    // On CI (Linux), this can break exports-map resolution.
    // Disable symlink resolution so webpack uses the symlinked path directly.
    if (config.resolve) config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
