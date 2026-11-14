import { defineConfig } from "tsup";

// Bundles the migration runner into a single file for the `migrate` container.
export default defineConfig({
  entry: { migrate: "src/migrate-cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
