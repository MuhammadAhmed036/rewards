import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 20000,
    // The tests share one database, and a few (daily jobs, scheduled offers, expiry) act on every shop in it.
    // Run files one after another so one file's jobs never pick up another file's data.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

