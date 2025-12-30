import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, users, projects, glossaries } from "../db";
import {
  glossaryCreateSchema,
  glossaryUpdateSchema,
  glossaryIdParamSchema,
  projectIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";

const glossariesRouter = new Hono();

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

/**
 * Helper to verify project ownership
 */
async function verifyProjectOwnership(userId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.user_id, userId), eq(projects.id, projectId)));

  return rows.length > 0 ? rows[0] : null;
}

// GET all glossaries for project
glossariesRouter.get(
  "/",
  zValidator("param", projectIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own glossaries"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);
    const project = await verifyProjectOwnership(user.id, projectId);

    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .select()
      .from(glossaries)
      .where(eq(glossaries.project_id, projectId));

    return c.json(successResponse(rows));
  }
);

// GET single glossary
glossariesRouter.get(
  "/:glossaryId",
  zValidator("param", glossaryIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, glossaryId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own glossaries"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);
    const project = await verifyProjectOwnership(user.id, projectId);

    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .select()
      .from(glossaries)
      .where(
        and(
          eq(glossaries.project_id, projectId),
          eq(glossaries.id, glossaryId)
        )
      );

    if (rows.length === 0) {
      return c.json(errorResponse("Glossary entry not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

// POST create glossary
glossariesRouter.post(
  "/",
  zValidator("param", projectIdParamSchema),
  zValidator("json", glossaryCreateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only create glossaries in your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);
    const project = await verifyProjectOwnership(user.id, projectId);

    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check for duplicate term
    const existing = await db
      .select()
      .from(glossaries)
      .where(
        and(eq(glossaries.project_id, projectId), eq(glossaries.term, body.term))
      );

    if (existing.length > 0) {
      return c.json(
        errorResponse("Glossary term already exists in this project"),
        409
      );
    }

    const rows = await db
      .insert(glossaries)
      .values({
        project_id: projectId,
        term: body.term,
        translations: body.translations,
        context: body.context ?? null,
      })
      .returning();

    return c.json(successResponse(rows[0]), 201);
  }
);

// PUT update glossary
glossariesRouter.put(
  "/:glossaryId",
  zValidator("param", glossaryIdParamSchema),
  zValidator("json", glossaryUpdateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, glossaryId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only update glossaries in your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);
    const project = await verifyProjectOwnership(user.id, projectId);

    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check if glossary exists
    const existing = await db
      .select()
      .from(glossaries)
      .where(
        and(
          eq(glossaries.project_id, projectId),
          eq(glossaries.id, glossaryId)
        )
      );

    if (existing.length === 0) {
      return c.json(errorResponse("Glossary entry not found"), 404);
    }

    const current = existing[0]!;

    // Check for duplicate term if changing
    if (body.term && body.term !== current.term) {
      const duplicate = await db
        .select()
        .from(glossaries)
        .where(
          and(
            eq(glossaries.project_id, projectId),
            eq(glossaries.term, body.term)
          )
        );

      if (duplicate.length > 0) {
        return c.json(
          errorResponse("Glossary term already exists in this project"),
          409
        );
      }
    }

    const rows = await db
      .update(glossaries)
      .set({
        term: body.term ?? current.term,
        translations: body.translations ?? current.translations,
        context: body.context ?? current.context,
        updated_at: new Date(),
      })
      .where(eq(glossaries.id, glossaryId))
      .returning();

    return c.json(successResponse(rows[0]));
  }
);

// DELETE glossary
glossariesRouter.delete(
  "/:glossaryId",
  zValidator("param", glossaryIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, glossaryId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only delete glossaries in your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);
    const project = await verifyProjectOwnership(user.id, projectId);

    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .delete(glossaries)
      .where(
        and(
          eq(glossaries.project_id, projectId),
          eq(glossaries.id, glossaryId)
        )
      )
      .returning();

    if (rows.length === 0) {
      return c.json(errorResponse("Glossary entry not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

export default glossariesRouter;
