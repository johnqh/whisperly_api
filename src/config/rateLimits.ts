import type { RateLimitsConfig } from "@sudobility/ratelimit_service";

/**
 * Rate limit configuration for whisperly_api
 *
 * - none: Free tier users (no subscription)
 * - whisperly: Users with whisperly entitlement
 * - pro: Pro users with higher limits
 * - enterprise: Enterprise users with unlimited access
 */
export const rateLimitsConfig: RateLimitsConfig = {
  none: { hourly: 10, daily: 50, monthly: 200 },
  whisperly: { hourly: 100, daily: 1000, monthly: 10000 },
  pro: { hourly: 500, daily: 5000, monthly: 50000 },
  enterprise: { hourly: undefined, daily: undefined, monthly: undefined },
};
