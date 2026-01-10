import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    alias: {
      "@sudobility/ratelimit_service": new URL(
        "./tests/__mocks__/ratelimit_service.ts",
        import.meta.url
      ).pathname,
    },
  },
});
