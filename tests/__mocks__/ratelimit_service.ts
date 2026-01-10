// Mock for @sudobility/ratelimit_service

export type RateLimitsConfig = Record<
  string,
  {
    hourly: number | undefined;
    daily: number | undefined;
    monthly: number | undefined;
  }
>;

export function createRateLimitMiddleware() {
  return async () => {};
}

export class RateLimitRouteHandler {
  constructor(_config: unknown) {}

  async getRateLimitStatus() {
    return { hourly: 0, daily: 0, monthly: 0 };
  }

  async getAllTierLimits() {
    return {};
  }
}
