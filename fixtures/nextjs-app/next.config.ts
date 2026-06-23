import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["next-fetch-panel"],
  webpack(config) {
    // Prevent webpack from resolving the file: symlink to its real path.
    // On CI (Linux), resolving to the real path breaks exports map resolution
    // for packages installed as file: dependencies.
    if (config.resolve) config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
