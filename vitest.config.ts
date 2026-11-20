import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server environment; tests exercise server modules directly.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      // Use the SDK's CommonJS build (its ESM build has a broken named import under Node ESM).
      "@pump-fun/pump-sdk/swap": path.resolve(__dirname, "node_modules/@pump-fun/pump-sdk/dist/swap/index.js"),
      "@pump-fun/pump-sdk": path.resolve(__dirname, "node_modules/@pump-fun/pump-sdk/dist/index.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
