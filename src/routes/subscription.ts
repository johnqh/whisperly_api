import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, users, subscriptions } from "../db";
import {
  successResponse,
  errorResponse,
  type RateLimitStatus,
} from "@sudobility/whisperly_types";

const subscriptionRouter = new Hono();

/**
 * Helper to get or create user by Firebase UID
 */
async function getOrCreateUser(firebaseUid: string, email?: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (existing.length > 0) {
    return existing[0]!;
  }

  const created = await db
    .insert(users)
    .values({
      firebase_uid: firebaseUid,
      email: email ?? null,
    })
    .returning();

  return created[0]!;
}

// GET subscription status
subscriptionRouter.get("/", async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");

  if (firebaseUser.uid !== userId) {
    return c.json(
      errorResponse("You can only access your own subscription"),
      403
    );
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, user.id));

  if (rows.length === 0) {
    return c.json(errorResponse("No subscription found"), 404);
  }

  return c.json(successResponse(rows[0]));
});

// GET rate limit status
subscriptionRouter.get("/rate-limit", async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");

  if (firebaseUser.uid !== userId) {
    return c.json(
      errorResponse("You can only access your own rate limit status"),
      403
    );
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, user.id));

  if (rows.length === 0) {
    return c.json(errorResponse("No subscription found"), 404);
  }

  const sub = rows[0]!;
  const now = new Date();

  // Calculate actual remaining after checking if reset needed
  let monthlyUsed = sub.requests_this_month;
  let hourlyUsed = sub.requests_this_hour;

  if (sub.month_reset_at && now > sub.month_reset_at) {
    monthlyUsed = 0;
  }

  if (sub.hour_reset_at && now > sub.hour_reset_at) {
    hourlyUsed = 0;
  }

  const rateLimitStatus: RateLimitStatus = {
    tier: sub.tier,
    monthly_limit: sub.monthly_request_limit,
    monthly_used: monthlyUsed,
    monthly_remaining: Math.max(0, sub.monthly_request_limit - monthlyUsed),
    hourly_limit: sub.hourly_request_limit,
    hourly_used: hourlyUsed,
    hourly_remaining: Math.max(0, sub.hourly_request_limit - hourlyUsed),
    resets_at: {
      monthly: sub.month_reset_at?.toISOString() ?? getNextMonthReset().toISOString(),
      hourly: sub.hour_reset_at?.toISOString() ?? getNextHourReset().toISOString(),
    },
  };

  return c.json(successResponse(rateLimitStatus));
});

/**
 * Get next monthly reset timestamp (first of next month)
 */
function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * Get next hourly reset timestamp
 */
function getNextHourReset(): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours() + 1,
    0,
    0,
    0
  );
}

export default subscriptionRouter;
