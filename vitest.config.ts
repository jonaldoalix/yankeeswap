import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["shared/**/*.ts", "server/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "shared/types.ts",
        "server/src/testConfig.ts",
        "server/src/index.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95, // Vitest 4/v8: one phantom branch in tokenFrom under coverage-v8
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
