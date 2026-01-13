import { Hono } from "hono";
import {
  successResponse,
  errorResponse,
} from "@sudobility/whisperly_types";
import {
  RateLimitPeriodType,
  type RateLimitsConfigResponse,
  type RateLimitHistoryResponse,
} from "@sudobility/types";
import { getRateLimitRouteHandler, rateLimitsConfig } from "../middleware/rateLimit";
import { getEnv } from "../lib/env-helper";
import { db, entities, entityMembers, entityInvitations, users } from "../db";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";

const ratelimitsRouter = new Hono();

// Create entity helpers
const config: InvitationHelperConfig = {
  db: db as any,
  entitiesTable: entities,
  membersTable: entityMembers,
  invitationsTable: entityInvitations,
  usersTable: users,
};

const helpers = createEntityHelpers(config);

/**
 * Extract testMode from URL query parameter
 */
function getTestMode(c: any): boolean {
  const url = new URL(c.req.url);
  const testMode = url.searchParams.get("testMode");
  return testMode === "true";
}

/**
 * Check if RevenueCat is configured
 */
function isRevenueCatConfigured(testMode: boolean = false): boolean {
  const key = testMode
    ? getEnv("REVENUECAT_API_KEY_SANDBOX")
    : getEnv("REVENUECAT_API_KEY");
  return !!key && key.length > 0;
}

/**
 * Verify user has access to entity and return its ID.
 * rateLimitUserId is taken from path parameter (this is an entity slug).
 */
async function getEntityIdForRateLimits(
  c: any,
  firebaseUid: string
): Promise<{ entityId: string | null; error: string | null }> {
  // In whisperly, rateLimitUserId is the entity slug
  const rateLimitUserId = c.req.param("rateLimitUserId");

  if (!rateLimitUserId) {
    return { entityId: null, error: "rateLimitUserId is required" };
  }

  // Look up entity by slug (rateLimitUserId is entity slug)
  const entity = await helpers.entity.getEntityBySlug(rateLimitUserId);
  if (!entity) {
    return { entityId: null, error: "Entity not found" };
  }

  // Verify user has access to this entity
  const canView = await helpers.permissions.canViewEntity(entity.id, firebaseUid);
  if (!canView) {
    return { entityId: null, error: "Access denied to entity" };
  }

  return { entityId: entity.id, error: null };
}

/**
 * GET /ratelimits/:rateLimitUserId
 * Returns rate limit configurations for all entitlement tiers
 * and the current entity's usage.
 * In whisperly, rateLimitUserId is the entity slug.
 * Query params:
 *   - testMode: Optional, set to "true" for sandbox mode.
 * Note: Firebase auth is applied at the admin routes level.
 */
ratelimitsRouter.get("/", async c => {
  try {
    const testMode = getTestMode(c);

    // If RevenueCat is not configured, return static config without usage data
    if (!isRevenueCatConfigured(testMode)) {
      const noneLimits = rateLimitsConfig.none;
      return c.json(successResponse({
        tiers: rateLimitsConfig,
        currentEntitlement: "none",
        currentLimits: noneLimits,
        currentUsage: {
          hourly: { used: 0, limit: noneLimits.hourly ?? 0, remaining: noneLimits.hourly ?? 0 },
          daily: { used: 0, limit: noneLimits.daily ?? 0, remaining: noneLimits.daily ?? 0 },
          monthly: { used: 0, limit: noneLimits.monthly ?? 0, remaining: noneLimits.monthly ?? 0 },
        },
      }));
    }

    const firebaseUser = c.get("firebaseUser");

    // Get entity ID for rate limit lookup
    const { entityId, error: entityError } = await getEntityIdForRateLimits(
      c,
      firebaseUser.uid
    );

    if (entityError || !entityId) {
      const status = entityError === "rateLimitUserId is required" ? 400 :
                     entityError === "Access denied to entity" ? 403 : 404;
      return c.json(errorResponse(entityError || "Entity not found"), status);
    }

    // Use entity ID for rate limits (subscriptions are per-entity)
    const data = await getRateLimitRouteHandler(testMode).getRateLimitsConfigData(
      entityId
    );

    return c.json(successResponse(data) as RateLimitsConfigResponse);
  } catch (error) {
    console.error("Error fetching rate limits config:", error);
    return c.json(errorResponse("Failed to fetch rate limits"), 500);
  }
});

/**
 * GET /ratelimits/:rateLimitUserId/history/:periodType
 * Returns usage history for a specific period type.
 * In whisperly, rateLimitUserId is the entity slug.
 * periodType can be: hour, day, or month
 * Query params:
 *   - testMode: Optional, set to "true" for sandbox mode.
 */
ratelimitsRouter.get("/history/:periodType", async c => {
  try {
    const testMode = getTestMode(c);
    const periodTypeParam = c.req.param("periodType");

    // Validate period type
    if (!["hour", "day", "month"].includes(periodTypeParam)) {
      return c.json(
        errorResponse(
          "Invalid period type. Must be one of: hour, day, month"
        ),
        400
      );
    }

    // If RevenueCat is not configured, return empty history
    if (!isRevenueCatConfigured(testMode)) {
      return c.json(successResponse({
        periodType: periodTypeParam as RateLimitPeriodType,
        entries: [],
        totalEntries: 0,
      }));
    }

    const periodType = periodTypeParam as RateLimitPeriodType;
    const firebaseUser = c.get("firebaseUser");

    // Get entity ID for rate limit lookup
    const { entityId, error: entityError } = await getEntityIdForRateLimits(
      c,
      firebaseUser.uid
    );

    if (entityError || !entityId) {
      const status = entityError === "rateLimitUserId is required" ? 400 :
                     entityError === "Access denied to entity" ? 403 : 404;
      return c.json(errorResponse(entityError || "Entity not found"), status);
    }

    // Use entity ID for rate limits (subscriptions are per-entity)
    const data = await getRateLimitRouteHandler(testMode).getRateLimitHistoryData(
      entityId,
      periodType
    );

    return c.json(successResponse(data) as RateLimitHistoryResponse);
  } catch (error) {
    console.error("Error fetching rate limit history:", error);
    return c.json(errorResponse("Failed to fetch rate limit history"), 500);
  }
});

export default ratelimitsRouter;
