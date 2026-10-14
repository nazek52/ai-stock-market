import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: [],
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
}));
