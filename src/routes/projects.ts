import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, entityMembers, projects, entityInvitations, users } from "../db";
import {
  projectCreateSchema,
  projectUpdateSchema,
  entitySlugParamSchema,
  entityProjectIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";

const projectsRouter = new Hono();

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

// GET all projects for entity
projectsRouter.get(
  "/",
  zValidator("param", entitySlugParamSchema),
  async c => {
    try {
      const userId = c.get("firebaseUser").uid;
      const { entitySlug } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.entity_id, result.entity.id));

      return c.json(successResponse(rows));
    } catch (err) {
      console.error("Error fetching projects:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch projects";
      return c.json(errorResponse(message), 500);
    }
  }
);

// GET single project
projectsRouter.get(
  "/:projectId",
  zValidator("param", entityProjectIdParamSchema),
  async c => {
    try {
      const userId = c.get("firebaseUser").uid;
      const { entitySlug, projectId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .select()
        .from(projects)
        .where(
          and(eq(projects.entity_id, result.entity.id), eq(projects.id, projectId))
        );

      if (rows.length === 0) {
        return c.json(errorResponse("Project not found"), 404);
      }

      return c.json(successResponse(rows[0]));
    } catch (err) {
      console.error("Error fetching project:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch project";
      return c.json(errorResponse(message), 500);
    }
  }
);

// POST create project
projectsRouter.post(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", projectCreateSchema),
  async c => {
    try {
      const userId = c.get("firebaseUser").uid;
      const { entitySlug } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      // Check for duplicate project name within entity
      const existing = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.entity_id, result.entity.id),
            eq(projects.project_name, body.project_name)
          )
        );

      if (existing.length > 0) {
        return c.json(errorResponse("Project name already exists"), 409);
      }

      const rows = await db
        .insert(projects)
        .values({
          entity_id: result.entity.id,
          project_name: body.project_name,
          display_name: body.display_name,
          description: body.description ?? null,
          instructions: body.instructions ?? null,
          default_source_language: body.default_source_language ?? null,
          default_target_languages: body.default_target_languages ?? null,
          ip_allowlist: body.ip_allowlist ?? null,
        })
        .returning();

      return c.json(successResponse(rows[0]), 201);
    } catch (err) {
      console.error("Error creating project:", err);
      const message = err instanceof Error ? err.message : "Failed to create project";
      return c.json(errorResponse(message), 500);
    }
  }
);

// PUT update project
projectsRouter.put(
  "/:projectId",
  zValidator("param", entityProjectIdParamSchema),
  zValidator("json", projectUpdateSchema),
  async c => {
    try {
      const userId = c.get("firebaseUser").uid;
      const { entitySlug, projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      // Check if project exists
      const existing = await db
        .select()
        .from(projects)
        .where(
          and(eq(projects.entity_id, result.entity.id), eq(projects.id, projectId))
        );

      if (existing.length === 0) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const current = existing[0]!;

      // Check for duplicate project name if changing
      if (body.project_name && body.project_name !== current.project_name) {
        const duplicate = await db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.entity_id, result.entity.id),
              eq(projects.project_name, body.project_name)
            )
          );

        if (duplicate.length > 0) {
          return c.json(errorResponse("Project name already exists"), 409);
        }
      }

      const rows = await db
        .update(projects)
        .set({
          project_name: body.project_name ?? current.project_name,
          display_name: body.display_name ?? current.display_name,
          description: body.description ?? current.description,
          instructions: body.instructions ?? current.instructions,
          is_active: body.is_active ?? current.is_active,
          updated_at: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      return c.json(successResponse(rows[0]));
    } catch (err) {
      console.error("Error updating project:", err);
      const message = err instanceof Error ? err.message : "Failed to update project";
      return c.json(errorResponse(message), 500);
    }
  }
);

// DELETE project
projectsRouter.delete(
  "/:projectId",
  zValidator("param", entityProjectIdParamSchema),
  async c => {
    try {
      const userId = c.get("firebaseUser").uid;
      const { entitySlug, projectId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .delete(projects)
        .where(and(eq(projects.entity_id, result.entity.id), eq(projects.id, projectId)))
        .returning();

      if (rows.length === 0) {
        return c.json(errorResponse("Project not found"), 404);
      }

      return c.json(successResponse(rows[0]));
    } catch (err) {
      console.error("Error deleting project:", err);
      const message = err instanceof Error ? err.message : "Failed to delete project";
      return c.json(errorResponse(message), 500);
    }
  }
);

export default projectsRouter;
