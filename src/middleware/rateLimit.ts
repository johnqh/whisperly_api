import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import {
  createRateLimitMiddleware,
  RateLimitRouteHandler,
  EntitlementHelper,
  RateLimitChecker,
} from "@sudobility/ratelimit_service";
import { SubscriptionHelper } from "@sudobility/subscription_service";
import { db, rateLimitCounters, entities } from "../db";
import { errorResponse } from "@sudobility/whisperly_types";
import { getEnv, getRequiredEnv } from "../lib/env-helper";
import { rateLimitsConfig } from "../config/rateLimits";

// Re-export for backward compatibility
export { rateLimitsConfig };

export const entitlementDisplayNames: Record<string, string> = {
  none: "Free",
  whisperly: "Whisperly",
  pro: "Pro",
  enterprise: "Enterprise",
};

// Lazy-initialized instances to avoid requiring env vars at module load time
let _subscriptionHelper: SubscriptionHelper | null = null;
let _entitlementHelper: EntitlementHelper | null = null;
let _rateLimitChecker: RateLimitChecker | null = null;
let _rateLimitRouteHandler: RateLimitRouteHandler | null = null;
let _rateLimitMiddleware: ReturnType<typeof createRateLimitMiddleware> | null =
  null;

/**
 * Get subscription helper (singleton, lazily initialized).
 * Uses single API key - testMode is passed to getSubscriptionInfo to filter sandbox purchases.
 */
export function getSubscriptionHelper(): SubscriptionHelper | null {
  const apiKey = getEnv("REVENUECAT_API_KEY");
  if (!apiKey) return null;
  if (!_subscriptionHelper) {
    _subscriptionHelper = new SubscriptionHelper({ revenueCatApiKey: apiKey });
  }
  return _subscriptionHelper;
}

export function getEntitlementHelper(): EntitlementHelper {
  if (!_entitlementHelper) {
    _entitlementHelper = new EntitlementHelper(rateLimitsConfig);
  }
  return _entitlementHelper;
}

export function getRateLimitChecker(): RateLimitChecker {
  if (!_rateLimitChecker) {
    _rateLimitChecker = new RateLimitChecker({
      db: db as any,
      table: rateLimitCounters as any,
    });
  }
  return _rateLimitChecker;
}

/**
 * Get the route handler for rate limit endpoints.
 * Lazily initialized to avoid requiring REVENUECAT_API_KEY at module load time.
 * Uses single API key - testMode is passed to individual methods to filter sandbox purchases.
 */
export function getRateLimitRouteHandler(): RateLimitRouteHandler {
  if (!_rateLimitRouteHandler) {
    _rateLimitRouteHandler = new RateLimitRouteHandler({
      revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
      rateLimitsConfig,
      db: db as any,
      rateLimitsTable: rateLimitCounters as any,
      entitlementDisplayNames,
    });
  }
  return _rateLimitRouteHandler;
}

/**
 * Get the rate limit middleware for whisperly_api.
 * Lazily initialized to avoid requiring REVENUECAT_API_KEY at module load time.
 * Uses single API key - testMode is extracted from URL query parameter to filter sandbox purchases.
 */
function getRateLimitMiddleware(): ReturnType<typeof createRateLimitMiddleware> {
  if (!_rateLimitMiddleware) {
    _rateLimitMiddleware = createRateLimitMiddleware({
      revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
      rateLimitsConfig,
      // Cast to any to avoid type conflicts between different drizzle-orm/hono instances
      // when using bun link for local development
      db: db as any,
      rateLimitsTable: rateLimitCounters as any,
      getUserId: (c: any) => {
        // Get the entity ID that was set by the entity lookup
        const entityId = c.get("rateLimitEntityId");
        if (!entityId) {
          throw new Error("Entity ID not found in context for rate limiting");
        }
        // Return entity ID as the "user" for rate limiting
        // (rate limits are now per-entity, not per-user)
        return entityId;
      },
      getTestMode: (c: any) => {
        const url = new URL(c.req.url);
        return url.searchParams.get("testMode") === "true";
      },
    });
  }
  return _rateLimitMiddleware;
}

/**
 * Extract testMode from URL query parameter.
 * Exported for use by route handlers that need to pass testMode to RateLimitRouteHandler methods.
 */
export function getTestMode(c: Context): boolean {
  const url = new URL(c.req.url);
  return url.searchParams.get("testMode") === "true";
}

/**
 * Rate limiting middleware for translation endpoints.
 *
 * This middleware:
 * 1. Looks up the entity by organization path (entity slug)
 * 2. Applies rate limiting using the subscription_service (per-entity)
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
  const orgPath = c.req.param("orgPath");
  const projectName = c.req.param("projectName");

  if (!orgPath || !projectName) {
    return c.json(errorResponse("Invalid path parameters"), 400);
  }

  // Find entity by slug (orgPath is now entity slug)
  const entityRows = await db
    .select({
      id: entities.id,
    })
    .from(entities)
    .where(eq(entities.entity_slug, orgPath));

  if (entityRows.length === 0) {
    return c.json(errorResponse("Organization not found"), 404);
  }

  const entityId = entityRows[0]!.id;

  // Store the entity ID for rate limiting
  c.set("rateLimitEntityId", entityId);

  // Skip rate limiting if RevenueCat is not configured
  const revenueCatApiKey = getEnv("REVENUECAT_API_KEY");
  if (!revenueCatApiKey) {
    await next();
    return;
  }

  // Apply rate limiting using subscription_service (per-entity)
  // Cast to any to avoid type conflicts between different hono instances
  const middleware = getRateLimitMiddleware();
  await middleware(c as any, next as any);
}

// Extend Hono context types
declare module "hono" {
  interface ContextVariableMap {
    firebaseUid: string;
    rateLimitUserId: string;
    rateLimitEntityId: string;
  }
}
