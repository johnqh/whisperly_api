/**
 * @fileoverview Analytics routes
 * @description GET endpoint for entity-scoped usage analytics with date range
 * filtering and per-project breakdown.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, projects, usageRecords } from "../db";
import { analyticsQuerySchema, entitySlugParamSchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type AnalyticsResponse,
  type UsageAggregate,
  type UsageByProject,
  type UsageByDate,
} from "@sudobility/whisperly_types";
import { entityHelpers } from "../lib/entity-config";
import { ErrorCode } from "../lib/error-codes";

const analyticsRouter = new Hono();

/**
 * Verify user has access to entity and return its ID.
 *
 * @param c - Hono context
 * @param firebaseUid - The user's Firebase UID
 * @returns The entity ID on success, or an error message on failure
 */
async function getEntityIdForAnalytics(
  c: any,
  firebaseUid: string
): Promise<{
  entityId: string | null;
  error: string | null;
  errorCode: string | null;
}> {
  const entitySlug = c.req.param("entitySlug");

  if (!entitySlug) {
    return {
      entityId: null,
      error: "entitySlug is required",
      errorCode: ErrorCode.ENTITY_SLUG_REQUIRED,
    };
  }

  // Look up entity by slug
  const entity = await entityHelpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return {
      entityId: null,
      error: "Entity not found",
      errorCode: ErrorCode.ENTITY_NOT_FOUND,
    };
  }

  // Verify user has access to this entity
  const canView = await entityHelpers.permissions.canViewEntity(
    entity.id,
    firebaseUid
  );
  if (!canView) {
    return {
      entityId: null,
      error: "Access denied to entity",
      errorCode: ErrorCode.ACCESS_DENIED,
    };
  }

  return { entityId: entity.id, error: null, errorCode: null };
}

// GET analytics for entity
analyticsRouter.get(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("query", analyticsQuerySchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const query = c.req.valid("query");

    // Get entity ID from path parameter
    const {
      entityId,
      error: entityError,
      errorCode,
    } = await getEntityIdForAnalytics(c, firebaseUser.uid);

    if (entityError || !entityId) {
      const status =
        errorCode === ErrorCode.ENTITY_SLUG_REQUIRED
          ? 400
          : errorCode === ErrorCode.ACCESS_DENIED
            ? 403
            : 404;
      return c.json(
        {
          ...errorResponse(entityError || "Entity not found"),
          errorCode: errorCode || ErrorCode.ENTITY_NOT_FOUND,
        },
        status
      );
    }

    // Get all projects for this entity
    const entityProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.entity_id, entityId));

    if (entityProjects.length === 0) {
      // Return empty analytics if no projects
      const emptyResponse: AnalyticsResponse = {
        aggregate: {
          total_requests: 0,
          total_strings: 0,
          total_characters: 0,
          successful_requests: 0,
          failed_requests: 0,
          success_rate: 0,
          period_start: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          period_end: new Date().toISOString(),
        },
        by_project: [],
        by_date: [],
      };
      return c.json(successResponse(emptyResponse));
    }

    const projectIds = entityProjects.map(p => p.id);
    const projectNameMap = new Map(
      entityProjects.map(p => [p.id, p.project_name])
    );

    // Build date range conditions
    const startDate = query.start_date
      ? new Date(query.start_date)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const endDate = query.end_date
      ? new Date(query.end_date + "T23:59:59")
      : new Date();

    // Build where conditions
    const conditions = [
      sql`${usageRecords.project_id} IN ${projectIds}`,
      gte(usageRecords.timestamp, startDate),
      lte(usageRecords.timestamp, endDate),
    ];

    if (query.project_id) {
      // Make sure the requested project belongs to this entity
      if (!projectIds.includes(query.project_id)) {
        return c.json(
          {
            ...errorResponse("Project not found in this entity"),
            errorCode: ErrorCode.PROJECT_NOT_FOUND,
          },
          404
        );
      }
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
        request_count: sql<number>`COALESCE(SUM(${usageRecords.request_count}), 0)::int`,
        string_count: sql<number>`COALESCE(SUM(${usageRecords.string_count}), 0)::int`,
        character_count: sql<number>`COALESCE(SUM(${usageRecords.character_count}), 0)::int`,
        successful_requests: sql<number>`COALESCE(SUM(CASE WHEN ${usageRecords.success} THEN ${usageRecords.request_count} ELSE 0 END), 0)::int`,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .groupBy(usageRecords.project_id);

    const byProject: UsageByProject[] = byProjectResult.map(row => ({
      project_id: row.project_id,
      project_name: projectNameMap.get(row.project_id) ?? "unknown",
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
