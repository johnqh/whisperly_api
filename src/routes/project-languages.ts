/**
 * @fileoverview Project languages routes
 * @description GET/POST endpoints for managing a project's selected target languages.
 * Auto-creates a default "en" record on first GET if none exists.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import {
  db,
  entities,
  entityMembers,
  projects,
  projectLanguages,
  entityInvitations,
  users,
} from "../db";
import {
  entityProjectIdParamSchema,
  projectLanguagesUpdateSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";
import {
  createEntityHelpers,
  type InvitationHelperConfig,
} from "@sudobility/entity_service";

const projectLanguagesRouter = new Hono();

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
): Promise<
  | { entity: typeof entities.$inferSelect; error?: string }
  | { entity?: undefined; error: string }
> {
  const entity = await helpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return { error: "Entity not found" };
  }

  if (requireEdit) {
    const canEdit = await helpers.permissions.canCreateProjects(
      entity.id,
      userId
    );
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

// GET project languages
// If no record exists, creates one with default "en" and returns it
projectLanguagesRouter.get(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  async (c) => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(
        errorResponse(result.error),
        result.error === "Entity not found" ? 404 : 403
      );
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check if languages record exists
    const existing = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.project_id, projectId));

    if (existing.length > 0) {
      return c.json(
        successResponse({
          project_id: projectId,
          languages: existing[0]!.languages,
        })
      );
    }

    // Create default record with "en"
    const created = await db
      .insert(projectLanguages)
      .values({
        project_id: projectId,
        languages: "en",
      })
      .returning();

    return c.json(
      successResponse({
        project_id: projectId,
        languages: created[0]!.languages,
      }),
      201
    );
  }
);

// POST update project languages
projectLanguagesRouter.post(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  zValidator("json", projectLanguagesUpdateSchema),
  async (c) => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");
    const { languages } = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(
        errorResponse(result.error),
        result.error === "Entity not found" ? 404 : 403
      );
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check if record exists
    const existing = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.project_id, projectId));

    if (existing.length > 0) {
      // Update existing record
      const updated = await db
        .update(projectLanguages)
        .set({
          languages,
          updated_at: new Date(),
        })
        .where(eq(projectLanguages.project_id, projectId))
        .returning();

      return c.json(
        successResponse({
          project_id: projectId,
          languages: updated[0]!.languages,
        })
      );
    }

    // Create new record
    const created = await db
      .insert(projectLanguages)
      .values({
        project_id: projectId,
        languages,
      })
      .returning();

    return c.json(
      successResponse({
        project_id: projectId,
        languages: created[0]!.languages,
      }),
      201
    );
  }
);

export default projectLanguagesRouter;
