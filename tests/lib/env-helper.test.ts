import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// We need to test getEnv and getRequiredEnv
// Since the module caches .env.local, we'll test the logic through process.env

describe("env-helper", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getEnv", () => {
    test("returns process.env value when set", async () => {
      process.env.TEST_VAR = "test-value";

      // Dynamic import to get fresh module
      const { getEnv } = await import("../../src/lib/env-helper");

      const result = getEnv("TEST_VAR");
      expect(result).toBe("test-value");
    });

    test("returns defaultValue when env var is not set", async () => {
      delete process.env.NONEXISTENT_VAR;

      const { getEnv } = await import("../../src/lib/env-helper");

      const result = getEnv("NONEXISTENT_VAR", "default");
      expect(result).toBe("default");
    });

    test("returns undefined when env var is not set and no default", async () => {
      delete process.env.NONEXISTENT_VAR;

      const { getEnv } = await import("../../src/lib/env-helper");

      const result = getEnv("NONEXISTENT_VAR");
      expect(result).toBeUndefined();
    });

    test("returns defaultValue when env var is empty string", async () => {
      process.env.EMPTY_VAR = "";

      const { getEnv } = await import("../../src/lib/env-helper");

      const result = getEnv("EMPTY_VAR", "fallback");
      expect(result).toBe("fallback");
    });
  });

  describe("getRequiredEnv", () => {
    test("returns value when env var is set", async () => {
      process.env.REQUIRED_VAR = "required-value";

      const { getRequiredEnv } = await import("../../src/lib/env-helper");

      const result = getRequiredEnv("REQUIRED_VAR");
      expect(result).toBe("required-value");
    });

    test("throws error when env var is not set", async () => {
      delete process.env.MISSING_REQUIRED;

      const { getRequiredEnv } = await import("../../src/lib/env-helper");

      expect(() => getRequiredEnv("MISSING_REQUIRED")).toThrow(
        "Required environment variable MISSING_REQUIRED is not set"
      );
    });

    test("throws error when env var is empty string", async () => {
      process.env.EMPTY_REQUIRED = "";

      const { getRequiredEnv } = await import("../../src/lib/env-helper");

      expect(() => getRequiredEnv("EMPTY_REQUIRED")).toThrow(
        "Required environment variable EMPTY_REQUIRED is not set"
      );
    });
  });
});
