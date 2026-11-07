import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.db.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          fileParallelism: false,
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
