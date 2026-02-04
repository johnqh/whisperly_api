import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, sql } from "drizzle-orm";
import { db, entities, entityMembers, projects, dictionary, dictionaryEntry, entityInvitations, users } from "../db";
import {
  dictionaryCreateSchema,
  dictionaryUpdateSchema,
  entityProjectIdParamSchema,
  entityDictionaryIdParamSchema,
  dictionarySearchParamSchema,
} from "../schemas";
import { successResponse, errorResponse, type DictionaryTranslations } from "@sudobility/whisperly_types";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";
import { invalidateProjectCache } from "../services/dictionaryCache";

const dictionaryRouter = new Hono();

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

/**
 * Helper to get all entries for a dictionary and return as { language_code: text } map
 */
async function getDictionaryTranslations(dictionaryId: string): Promise<DictionaryTranslations> {
  const entries = await db
    .select()
    .from(dictionaryEntry)
    .where(eq(dictionaryEntry.dictionary_id, dictionaryId));

  const translations: DictionaryTranslations = {};
  for (const entry of entries) {
    translations[entry.language_code] = entry.text;
  }
  return translations;
}

// GET list all dictionaries for a project
dictionaryRouter.get(
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

    // Get all dictionaries for this project
    const dictionaries = await db
      .select({
        id: dictionary.id,
        created_at: dictionary.created_at,
        updated_at: dictionary.updated_at,
      })
      .from(dictionary)
      .where(
        and(
          eq(dictionary.entity_id, result.entity.id),
          eq(dictionary.project_id, projectId)
        )
      );

    // Get translations for each dictionary
    const results = await Promise.all(
      dictionaries.map(async dict => {
        const translations = await getDictionaryTranslations(dict.id);
        return {
          dictionary_id: dict.id,
          translations,
          created_at: dict.created_at,
          updated_at: dict.updated_at,
        };
      })
    );

    return c.json(successResponse(results));
  }
);

// GET search dictionary by language_code and text (case-insensitive exact match)
dictionaryRouter.get(
  "/search/:language_code/:text",
  zValidator("param", dictionarySearchParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, language_code, text } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Find dictionary entry with case-insensitive exact match
    const matchingEntries = await db
      .select({
        dictionary_id: dictionaryEntry.dictionary_id,
      })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionaryEntry.dictionary_id, dictionary.id))
      .where(
        and(
          eq(dictionary.entity_id, result.entity.id),
          eq(dictionary.project_id, projectId),
          eq(dictionaryEntry.language_code, language_code),
          sql`LOWER(${dictionaryEntry.text}) = LOWER(${text})`
        )
      )
      .limit(1);

    if (matchingEntries.length === 0) {
      return c.json(errorResponse("Dictionary entry not found"), 404);
    }

    const dictionaryId = matchingEntries[0]!.dictionary_id;
    const translations = await getDictionaryTranslations(dictionaryId);

    return c.json(successResponse({
      dictionary_id: dictionaryId,
      translations,
    }));
  }
);

// POST create dictionary (upsert behavior - updates if any entry matches)
dictionaryRouter.post(
  "/",
  zValidator("param", entityProjectIdParamSchema),
  zValidator("json", dictionaryCreateSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId } = c.req.valid("param");
    const translations = c.req.valid("json") as DictionaryTranslations;

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Check if any of the translations already exist (case-insensitive)
    let existingDictionaryId: string | null = null;

    for (const [langCode, text] of Object.entries(translations)) {
      const matchingEntries = await db
        .select({
          dictionary_id: dictionaryEntry.dictionary_id,
        })
        .from(dictionaryEntry)
        .innerJoin(dictionary, eq(dictionaryEntry.dictionary_id, dictionary.id))
        .where(
          and(
            eq(dictionary.entity_id, result.entity.id),
            eq(dictionary.project_id, projectId),
            eq(dictionaryEntry.language_code, langCode),
            sql`LOWER(${dictionaryEntry.text}) = LOWER(${text})`
          )
        )
        .limit(1);

      if (matchingEntries.length > 0) {
        existingDictionaryId = matchingEntries[0]!.dictionary_id;
        break;
      }
    }

    if (existingDictionaryId) {
      // Update existing dictionary - upsert entries
      for (const [langCode, text] of Object.entries(translations)) {
        await db
          .insert(dictionaryEntry)
          .values({
            dictionary_id: existingDictionaryId,
            language_code: langCode,
            text,
          })
          .onConflictDoUpdate({
            target: [dictionaryEntry.dictionary_id, dictionaryEntry.language_code],
            set: {
              text,
              updated_at: new Date(),
            },
          });
      }

      // Update dictionary timestamp
      await db
        .update(dictionary)
        .set({ updated_at: new Date() })
        .where(eq(dictionary.id, existingDictionaryId));

      // Invalidate dictionary cache for this project
      invalidateProjectCache(result.entity.id, projectId);

      const updatedTranslations = await getDictionaryTranslations(existingDictionaryId);
      return c.json(successResponse({
        dictionary_id: existingDictionaryId,
        translations: updatedTranslations,
      }));
    }

    // Create new dictionary
    const newDictionary = await db
      .insert(dictionary)
      .values({
        entity_id: result.entity.id,
        project_id: projectId,
      })
      .returning();

    const newDictionaryId = newDictionary[0]!.id;

    // Create entries
    for (const [langCode, text] of Object.entries(translations)) {
      await db
        .insert(dictionaryEntry)
        .values({
          dictionary_id: newDictionaryId,
          language_code: langCode,
          text,
        });
    }

    // Invalidate dictionary cache for this project
    invalidateProjectCache(result.entity.id, projectId);

    return c.json(successResponse({
      dictionary_id: newDictionaryId,
      translations,
    }), 201);
  }
);

// PUT update dictionary (partial update - keeps entries not in payload)
dictionaryRouter.put(
  "/:dictionaryId",
  zValidator("param", entityDictionaryIdParamSchema),
  zValidator("json", dictionaryUpdateSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, dictionaryId } = c.req.valid("param");
    const translations = c.req.valid("json") as DictionaryTranslations;

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Verify dictionary exists and belongs to this entity/project
    const existingDict = await db
      .select()
      .from(dictionary)
      .where(
        and(
          eq(dictionary.id, dictionaryId),
          eq(dictionary.entity_id, result.entity.id),
          eq(dictionary.project_id, projectId)
        )
      );

    if (existingDict.length === 0) {
      return c.json(errorResponse("Dictionary not found"), 404);
    }

    // Upsert entries (partial update - only update/add what's in payload)
    for (const [langCode, text] of Object.entries(translations)) {
      await db
        .insert(dictionaryEntry)
        .values({
          dictionary_id: dictionaryId,
          language_code: langCode,
          text,
        })
        .onConflictDoUpdate({
          target: [dictionaryEntry.dictionary_id, dictionaryEntry.language_code],
          set: {
            text,
            updated_at: new Date(),
          },
        });
    }

    // Update dictionary timestamp
    await db
      .update(dictionary)
      .set({ updated_at: new Date() })
      .where(eq(dictionary.id, dictionaryId));

    // Invalidate dictionary cache for this project
    invalidateProjectCache(result.entity.id, projectId);

    const updatedTranslations = await getDictionaryTranslations(dictionaryId);

    return c.json(successResponse({
      dictionary_id: dictionaryId,
      translations: updatedTranslations,
    }));
  }
);

// DELETE dictionary (cascade deletes all entries)
dictionaryRouter.delete(
  "/:dictionaryId",
  zValidator("param", entityDictionaryIdParamSchema),
  async c => {
    const userId = c.get("firebaseUser").uid;
    const { entitySlug, projectId, dictionaryId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Get translations before deleting for response
    const translations = await getDictionaryTranslations(dictionaryId);

    // Delete dictionary (cascade deletes entries)
    const deleted = await db
      .delete(dictionary)
      .where(
        and(
          eq(dictionary.id, dictionaryId),
          eq(dictionary.entity_id, result.entity.id),
          eq(dictionary.project_id, projectId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return c.json(errorResponse("Dictionary not found"), 404);
    }

    // Invalidate dictionary cache for this project
    invalidateProjectCache(result.entity.id, projectId);

    return c.json(successResponse({
      dictionary_id: dictionaryId,
      translations,
    }));
  }
);

export default dictionaryRouter;
