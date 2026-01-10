import { describe, test, expect } from "vitest";
import { rateLimitsConfig } from "../../src/config/rateLimits";

describe("rateLimitsConfig", () => {
  describe("tier limits", () => {
    test("none tier has lowest limits", () => {
      expect(rateLimitsConfig.none).toEqual({
        hourly: 10,
        daily: 50,
        monthly: 200,
      });
    });

    test("whisperly tier has moderate limits", () => {
      expect(rateLimitsConfig.whisperly).toEqual({
        hourly: 100,
        daily: 1000,
        monthly: 10000,
      });
    });

    test("pro tier has higher limits", () => {
      expect(rateLimitsConfig.pro).toEqual({
        hourly: 500,
        daily: 5000,
        monthly: 50000,
      });
    });

    test("enterprise tier has unlimited access", () => {
      expect(rateLimitsConfig.enterprise).toEqual({
        hourly: undefined,
        daily: undefined,
        monthly: undefined,
      });
    });
  });

  describe("tier progression", () => {
    test("higher tiers have higher or equal limits", () => {
      const tiers = ["none", "whisperly", "pro"] as const;

      for (let i = 0; i < tiers.length - 1; i++) {
        const currentTier = tiers[i]!;
        const nextTier = tiers[i + 1]!;

        const current = rateLimitsConfig[currentTier];
        const next = rateLimitsConfig[nextTier];

        expect(next.hourly).toBeGreaterThan(current.hourly!);
        expect(next.daily).toBeGreaterThan(current.daily!);
        expect(next.monthly).toBeGreaterThan(current.monthly!);
      }
    });

    test("daily limit is greater than hourly for each tier", () => {
      const tiers = ["none", "whisperly", "pro"] as const;

      for (const tier of tiers) {
        const limits = rateLimitsConfig[tier];
        expect(limits.daily).toBeGreaterThan(limits.hourly!);
      }
    });

    test("monthly limit is greater than daily for each tier", () => {
      const tiers = ["none", "whisperly", "pro"] as const;

      for (const tier of tiers) {
        const limits = rateLimitsConfig[tier];
        expect(limits.monthly).toBeGreaterThan(limits.daily!);
      }
    });
  });
});
