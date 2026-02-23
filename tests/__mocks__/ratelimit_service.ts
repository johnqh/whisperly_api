// Mock for @sudobility/ratelimit_service
import {
  pgSchema,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

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

export class EntitlementHelper {
  constructor(_config: unknown) {}
}

export class RateLimitChecker {
  constructor(_config: unknown) {}
}

export function createRateLimitCountersTable(schema: ReturnType<typeof pgSchema>, _prefix: string) {
  return schema.table("rate_limit_counters", {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: varchar("user_id", { length: 255 }).notNull(),
    period_type: varchar("period_type", { length: 10 }).notNull(),
    period_key: varchar("period_key", { length: 50 }).notNull(),
    count: integer("count").notNull().default(0),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  }, (table) => ({
    userIdx: index("mock_rate_limit_user_idx").on(table.user_id),
  }));
}

export function initRateLimitTable() {
  return Promise.resolve();
}
