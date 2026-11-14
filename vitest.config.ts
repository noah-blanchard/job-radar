import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/{src,test}/**/*.test.ts"],
    environment: "node",
    env: { TZ: "America/Toronto" },
    // PGlite (WASM Postgres) tests are CPU and memory heavy: with one fork per core, a fork
    // crashed on Windows (0xC0000409) and a migration-bound test hit the 5 s default.
    maxWorkers: 6,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
