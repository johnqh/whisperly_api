/**
 * @fileoverview Project languages routes
 * @description GET/POST endpoints for managing a project's selected target languages.
 * Auto-creates a default "en" record on first GET if none exists.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db, projectLanguages } from "../db";
import {
  entityProjectIdParamSchema,
  projectLanguagesUpdateSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";
import {
  getEntityWithPermission,
  getEntityErrorStatus,
  verifyProjectOwnership,
} from "../lib/entity-helpers";
import { ErrorCode } from "../lib/error-codes";

const projectLanguagesRouter = new Hono();

// GET project languages
// If no record exists, creates one with default "en" and returns it
projectLanguagesRouter.get(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error !== undefined) {
      return c.json(
        { ...errorResponse(result.error), errorCode: result.errorCode },
        getEntityErrorStatus(result.errorCode)
      );
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(
        {
          ...errorResponse("Project not found"),
          errorCode: ErrorCode.PROJECT_NOT_FOUND,
        },
        404
      );
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
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");
    const { languages } = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error !== undefined) {
      return c.json(
        { ...errorResponse(result.error), errorCode: result.errorCode },
        getEntityErrorStatus(result.errorCode)
      );
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(
        {
          ...errorResponse("Project not found"),
          errorCode: ErrorCode.PROJECT_NOT_FOUND,
        },
        404
      );
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
