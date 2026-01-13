import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, entityMembers, projects, endpoints, entityInvitations, users } from "../db";
import {
  endpointCreateSchema,
  endpointUpdateSchema,
  entityProjectIdParamSchema,
  entityEndpointIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";

const endpointsRouter = new Hono();

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
 * Helper to get entity by slug and verify user membership
 */
async function getEntityWithPermission(
  entitySlug: string,
  userId: string,
  requireEdit = false
): Promise<{ entity: typeof entities.$inferSelect; error?: string } | { entity?: undefined; error: string }> {
  const entity = await helpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return { error: "Entity not found" };
  }

  if (requireEdit) {
    const canEdit = await helpers.permissions.canCreateProjects(entity.id, userId);
    if (!canEdit) {
      return { error: "Insufficient permissions" };
    }
  } else {
    const canView = await helpers.permissions.canViewEntity(entity.id, userId);
    if (!canView) {
      return { error: "Access denied" };
    }
  }

  return { entity };
}

/**
 * Helper to verify project belongs to entity
 */
async function verifyProjectOwnership(entityId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.entity_id, entityId), eq(projects.id, projectId)));

  return rows.length > 0 ? rows[0]! : null;
}

// GET all endpoints for project
endpointsRouter.get(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.project_id, projectId));

    return c.json(successResponse(rows));
  }
);

// GET single endpoint
endpointsRouter.get(
  "/:endpointId",
  zValidator("param", entityEndpointIdParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, endpointId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .select()
      .from(endpoints)
      .where(
        and(eq(endpoints.project_id, projectId), eq(endpoints.id, endpointId))
      );

    if (rows.length === 0) {
      return c.json(errorResponse("Endpoint not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

// POST create endpoint
endpointsRouter.post(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  zValidator("json", endpointCreateSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check for duplicate endpoint name within project
    const existing = await db
      .select()
      .from(endpoints)
      .where(
        and(
          eq(endpoints.project_id, projectId),
          eq(endpoints.endpoint_name, body.endpoint_name)
        )
      );

    if (existing.length > 0) {
      return c.json(
        errorResponse("Endpoint name already exists in this project"),
        409
      );
    }

    const rows = await db
      .insert(endpoints)
      .values({
        project_id: projectId,
        endpoint_name: body.endpoint_name,
        display_name: body.display_name,
        http_method: body.http_method ?? "POST",
        instructions: body.instructions ?? null,
        default_source_language: body.default_source_language ?? null,
        default_target_languages: body.default_target_languages ?? null,
        ip_allowlist: body.ip_allowlist ?? null,
      })
      .returning();

    return c.json(successResponse(rows[0]), 201);
  }
);

// PUT update endpoint
endpointsRouter.put(
  "/:endpointId",
  zValidator("param", entityEndpointIdParamSchema),
  zValidator("json", endpointUpdateSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, endpointId } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check if endpoint exists
    const existing = await db
      .select()
      .from(endpoints)
      .where(
        and(eq(endpoints.project_id, projectId), eq(endpoints.id, endpointId))
      );

    if (existing.length === 0) {
      return c.json(errorResponse("Endpoint not found"), 404);
    }

    const current = existing[0]!;

    // Check for duplicate endpoint name if changing
    if (body.endpoint_name && body.endpoint_name !== current.endpoint_name) {
      const duplicate = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.endpoint_name, body.endpoint_name)
          )
        );

      if (duplicate.length > 0) {
        return c.json(
          errorResponse("Endpoint name already exists in this project"),
          409
        );
      }
    }

    // Handle nullable fields - null means clear, undefined means keep current
    const ipAllowlist =
      body.ip_allowlist === null
        ? null
        : body.ip_allowlist !== undefined
          ? body.ip_allowlist
          : current.ip_allowlist;

    const defaultTargetLanguages =
      body.default_target_languages === null
        ? null
        : body.default_target_languages !== undefined
          ? body.default_target_languages
          : current.default_target_languages;

    const defaultSourceLanguage =
      body.default_source_language === null
        ? null
        : body.default_source_language !== undefined
          ? body.default_source_language
          : current.default_source_language;

    const rows = await db
      .update(endpoints)
      .set({
        endpoint_name: body.endpoint_name ?? current.endpoint_name,
        display_name: body.display_name ?? current.display_name,
        http_method: body.http_method ?? current.http_method,
        instructions: body.instructions ?? current.instructions,
        default_source_language: defaultSourceLanguage,
        default_target_languages: defaultTargetLanguages,
        is_active: body.is_active ?? current.is_active,
        ip_allowlist: ipAllowlist,
        updated_at: new Date(),
      })
      .where(eq(endpoints.id, endpointId))
      .returning();

    return c.json(successResponse(rows[0]));
  }
);

// DELETE endpoint
endpointsRouter.delete(
  "/:endpointId",
  zValidator("param", entityEndpointIdParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, endpointId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .delete(endpoints)
      .where(
        and(eq(endpoints.project_id, projectId), eq(endpoints.id, endpointId))
      )
      .returning();

    if (rows.length === 0) {
      return c.json(errorResponse("Endpoint not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

export default endpointsRouter;
