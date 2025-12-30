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
import { rateLimitRouteHandler } from "../middleware/rateLimit";

const ratelimitsRouter = new Hono();

/**
 * GET /ratelimits
 * Returns rate limit configurations for all entitlement tiers
 * and the current user's usage.
 * Note: Firebase auth is applied at the admin routes level.
 */
ratelimitsRouter.get("/", async c => {
  try {
    const firebaseUser = c.get("firebaseUser");
    const data = await rateLimitRouteHandler.getRateLimitsConfigData(
      firebaseUser.uid
    );

    return c.json(successResponse(data) as RateLimitsConfigResponse);
  } catch (error) {
    console.error("Error fetching rate limits config:", error);
    return c.json(errorResponse("Failed to fetch rate limits"), 500);
  }
});

/**
 * GET /ratelimits/history/:periodType
 * Returns usage history for a specific period type.
 * periodType can be: hour, day, or month
 */
ratelimitsRouter.get("/history/:periodType", async c => {
  try {
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

    const periodType = periodTypeParam as RateLimitPeriodType;
    const firebaseUser = c.get("firebaseUser");

    const data = await rateLimitRouteHandler.getRateLimitHistoryData(
      firebaseUser.uid,
      periodType
    );

    return c.json(successResponse(data) as RateLimitHistoryResponse);
  } catch (error) {
    console.error("Error fetching rate limit history:", error);
    return c.json(errorResponse("Failed to fetch rate limit history"), 500);
  }
});

export default ratelimitsRouter;
