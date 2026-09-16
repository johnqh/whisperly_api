import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./tests/setup.db.ts"],
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // One database, shared across files. Parallel files corrupt each other.
    fileParallelism: false,
    deps: {
      interopDefault: true,
    },
    server: {
      deps: {
        inline: ["@sudobility/subscription_service"],
      },
    },
  },
  resolve: {
    alias: {
      "@sudobility/ratelimit_service": new URL(
        "./tests/__mocks__/ratelimit_service.ts",
        import.meta.url
      ).pathname,
      "@sudobility/auth_service": new URL(
        "./tests/__mocks__/auth_service.ts",
        import.meta.url
      ).pathname,
      "@sudobility/entity_service": new URL(
        "./tests/__mocks__/entity_service.ts",
        import.meta.url
      ).pathname,
    },
  },
});
