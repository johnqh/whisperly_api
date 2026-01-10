import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import {
  createRateLimitMiddleware,
  RateLimitRouteHandler,
} from "@sudobility/ratelimit_service";
import { db, rateLimitCounters, users, userSettings } from "../db";
import { errorResponse } from "@sudobility/whisperly_types";
import { getRequiredEnv } from "../lib/env-helper";
import { rateLimitsConfig } from "../config/rateLimits";

// Re-export for backward compatibility
export { rateLimitsConfig };

/**
 * Route handler for rate limit endpoints.
 */
export const rateLimitRouteHandler = new RateLimitRouteHandler({
  revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
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

/**
 * Internal rate limit middleware created by subscription_service.
 * This expects the Firebase UID to be available via getUserId.
 */
const internalRateLimitMiddleware = createRateLimitMiddleware({
  revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
  rateLimitsConfig,
  // Cast to any to avoid type conflicts between different drizzle-orm/hono instances
  // when using bun link for local development
  db: db as any,
  rateLimitsTable: rateLimitCounters as any,
  getUserId: (c) => {
    // Get the Firebase UID that was set by the user lookup
    const firebaseUid = (c as any).get("firebaseUid");
    if (!firebaseUid) {
      throw new Error("Firebase UID not found in context");
    }
    return firebaseUid;
  },
});

/**
 * Rate limiting middleware for translation endpoints.
 *
 * This middleware:
 * 1. Looks up the user by organization path
 * 2. Applies rate limiting using the subscription_service
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
  const orgPath = c.req.param("orgPath");
  const projectName = c.req.param("projectName");

  if (!orgPath || !projectName) {
    return c.json(errorResponse("Invalid path parameters"), 400);
  }

  // Find user by organization path
  const settingsRows = await db
    .select({
      user_id: userSettings.user_id,
    })
    .from(userSettings)
    .where(eq(userSettings.organization_path, orgPath));

  let userId: string | null = null;
  let firebaseUid: string | null = null;

  if (settingsRows.length > 0) {
    userId = settingsRows[0]!.user_id;
    // Get the Firebase UID for this user
    const userRows = await db
      .select({ firebase_uid: users.firebase_uid })
      .from(users)
      .where(eq(users.id, userId));

    if (userRows.length > 0) {
      firebaseUid = userRows[0]!.firebase_uid;
    }
  } else {
    // Try finding by Firebase UID directly (default org path)
    const userRows = await db
      .select({ id: users.id, firebase_uid: users.firebase_uid })
      .from(users)
      .where(eq(users.firebase_uid, orgPath));

    if (userRows.length > 0) {
      userId = userRows[0]!.id;
      firebaseUid = userRows[0]!.firebase_uid;
    }
  }

  if (!userId || !firebaseUid) {
    return c.json(errorResponse("Organization not found"), 404);
  }

  // Store the Firebase UID for rate limiting and user ID for route handlers
  c.set("firebaseUid", firebaseUid);
  c.set("rateLimitUserId", userId);

  // Apply rate limiting using subscription_service
  // Cast to any to avoid type conflicts between different hono instances
  await internalRateLimitMiddleware(c as any, next as any);
}

// Extend Hono context types
declare module "hono" {
  interface ContextVariableMap {
    firebaseUid: string;
    rateLimitUserId: string;
  }
}
