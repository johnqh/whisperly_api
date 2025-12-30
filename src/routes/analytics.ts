import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, users, projects, usageRecords } from "../db";
import { analyticsQuerySchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type AnalyticsResponse,
  type UsageAggregate,
  type UsageByProject,
  type UsageByDate,
} from "@sudobility/whisperly_types";

const analyticsRouter = new Hono();

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

// GET analytics
analyticsRouter.get(
  "/",
  zValidator("query", analyticsQuerySchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const userId = c.req.param("userId");
    const query = c.req.valid("query");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own analytics"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

    // Build date range conditions
    const startDate = query.start_date
      ? new Date(query.start_date)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const endDate = query.end_date
      ? new Date(query.end_date + "T23:59:59")
      : new Date();

    // Build where conditions
    const conditions = [
      eq(usageRecords.user_id, user.id),
      gte(usageRecords.timestamp, startDate),
      lte(usageRecords.timestamp, endDate),
    ];

    if (query.project_id) {
      conditions.push(eq(usageRecords.project_id, query.project_id));
    }

    // Get aggregate stats
    const aggregateResult = await db
      .select({
        total_requests: sql<number>`COALESCE(SUM(${usageRecords.request_count}), 0)::int`,
        total_strings: sql<number>`COALESCE(SUM(${usageRecords.string_count}), 0)::int`,
        total_characters: sql<number>`COALESCE(SUM(${usageRecords.character_count}), 0)::int`,
        successful_requests: sql<number>`COALESCE(SUM(CASE WHEN ${usageRecords.success} THEN ${usageRecords.request_count} ELSE 0 END), 0)::int`,
        failed_requests: sql<number>`COALESCE(SUM(CASE WHEN NOT ${usageRecords.success} THEN ${usageRecords.request_count} ELSE 0 END), 0)::int`,
      })
      .from(usageRecords)
      .where(and(...conditions));

    const aggRow = aggregateResult[0]!;
    const totalRequests = aggRow.total_requests || 0;
    const successRate =
      totalRequests > 0
        ? Math.round((aggRow.successful_requests / totalRequests) * 100) / 100
        : 0;

    const aggregate: UsageAggregate = {
      total_requests: totalRequests,
      total_strings: aggRow.total_strings || 0,
      total_characters: aggRow.total_characters || 0,
      successful_requests: aggRow.successful_requests || 0,
      failed_requests: aggRow.failed_requests || 0,
      success_rate: successRate,
      period_start: startDate.toISOString(),
      period_end: endDate.toISOString(),
    };

    // Get usage by project
    const byProjectResult = await db
      .select({
        project_id: usageRecords.project_id,
        project_name: projects.project_name,
        request_count: sql<number>`COALESCE(SUM(${usageRecords.request_count}), 0)::int`,
        string_count: sql<number>`COALESCE(SUM(${usageRecords.string_count}), 0)::int`,
        character_count: sql<number>`COALESCE(SUM(${usageRecords.character_count}), 0)::int`,
        successful_requests: sql<number>`COALESCE(SUM(CASE WHEN ${usageRecords.success} THEN ${usageRecords.request_count} ELSE 0 END), 0)::int`,
      })
      .from(usageRecords)
      .innerJoin(projects, eq(usageRecords.project_id, projects.id))
      .where(and(...conditions))
      .groupBy(usageRecords.project_id, projects.project_name);

    const byProject: UsageByProject[] = byProjectResult.map(row => ({
      project_id: row.project_id,
      project_name: row.project_name,
      request_count: row.request_count || 0,
      string_count: row.string_count || 0,
      character_count: row.character_count || 0,
      success_rate:
        row.request_count > 0
          ? Math.round((row.successful_requests / row.request_count) * 100) /
            100
          : 0,
    }));

    // Get usage by date
    const byDateResult = await db
      .select({
        date: sql<string>`DATE(${usageRecords.timestamp})::text`,
        request_count: sql<number>`COALESCE(SUM(${usageRecords.request_count}), 0)::int`,
        string_count: sql<number>`COALESCE(SUM(${usageRecords.string_count}), 0)::int`,
        character_count: sql<number>`COALESCE(SUM(${usageRecords.character_count}), 0)::int`,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .groupBy(sql`DATE(${usageRecords.timestamp})`)
      .orderBy(sql`DATE(${usageRecords.timestamp})`);

    const byDate: UsageByDate[] = byDateResult.map(row => ({
      date: row.date,
      request_count: row.request_count || 0,
      string_count: row.string_count || 0,
      character_count: row.character_count || 0,
    }));

    const response: AnalyticsResponse = {
      aggregate,
      by_project: byProject,
      by_date: byDate,
    };

    return c.json(successResponse(response));
  }
);

export default analyticsRouter;
