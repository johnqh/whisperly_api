import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import {
  createRateLimitMiddleware,
  RateLimitRouteHandler,
} from "@sudobility/ratelimit_service";
import { db, rateLimitCounters, entities } from "../db";
import { errorResponse } from "@sudobility/whisperly_types";
import { getEnv } from "../lib/env-helper";
import { rateLimitsConfig } from "../config/rateLimits";

// Re-export for backward compatibility
export { rateLimitsConfig };

/**
 * Factory function to get RateLimitRouteHandler with optional sandbox mode
 */
export function getRateLimitRouteHandler(testMode: boolean = false): RateLimitRouteHandler {
  const apiKey = testMode
    ? getEnv("REVENUECAT_API_KEY_SANDBOX")
    : getEnv("REVENUECAT_API_KEY");

  return new RateLimitRouteHandler({
    revenueCatApiKey: apiKey ?? "",
    rateLimitsConfig,
    db: db as any,
    rateLimitsTable: rateLimitCounters as any,
    entitlementDisplayNames: {
      none: "Free",
      whisperly: "Whisperly",
      pro: "Pro",
      enterprise: "Enterprise",
    },
  });
}

/**
 * Legacy route handler (production mode).
 * @deprecated Use getRateLimitRouteHandler(testMode) instead.
 */
export const rateLimitRouteHandler = getRateLimitRouteHandler(false);

/**
 * Internal rate limit middleware created by subscription_service.
 * This expects the Firebase UID to be available via getUserId.
 */
const internalRateLimitMiddleware = createRateLimitMiddleware({
  revenueCatApiKey: getEnv("REVENUECAT_API_KEY") ?? "",
  rateLimitsConfig,
  // Cast to any to avoid type conflicts between different drizzle-orm/hono instances
  // when using bun link for local development
  db: db as any,
  rateLimitsTable: rateLimitCounters as any,
  getUserId: (c) => {
    // Get the entity ID that was set by the entity lookup
    const entityId = (c as any).get("rateLimitEntityId");
    if (!entityId) {
      throw new Error("Entity ID not found in context for rate limiting");
    }
    // Return entity ID as the "user" for rate limiting
    // (rate limits are now per-entity, not per-user)
    return entityId;
  },
});

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
  const endpointName = c.req.param("endpointName");

  if (!orgPath || !projectName || !endpointName) {
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

  // Apply rate limiting using subscription_service (per-entity)
  // Cast to any to avoid type conflicts between different hono instances
  await internalRateLimitMiddleware(c as any, next as any);
}

// Extend Hono context types
declare module "hono" {
  interface ContextVariableMap {
    firebaseUid: string;
    rateLimitUserId: string;
    rateLimitEntityId: string;
  }
}
