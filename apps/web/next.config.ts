import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone bundle includes workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: ["@jobradar/core", "@jobradar/db"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
