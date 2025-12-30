import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, users, projects, glossaries, usageRecords, userSettings } from "../db";
import {
  translateParamSchema,
  translationRequestSchema,
  glossaryLookupParamSchema,
  glossaryLookupQuerySchema,
} from "../schemas";
import {
  successResponse,
  errorResponse,
  type TranslationResponse,
  type GlossaryLookupResponse,
} from "@sudobility/whisperly_types";
import {
  translateStrings,
  buildGlossaryCallbackUrl,
  extractGlossaryTerms,
} from "../services/translation";
import { rateLimitMiddleware } from "../middleware/rateLimit";

const translateRouter = new Hono();

/**
 * Helper to find project by org path and project name
 */
async function findProject(orgPath: string, projectName: string) {
  // First try to find by organization path
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.organization_path, orgPath));

  let userId: string | null = null;

  if (settingsRows.length > 0) {
    userId = settingsRows[0]!.user_id;
  } else {
    // Try finding by user UUID prefix (default org path)
    const userRows = await db.select().from(users);
    for (const user of userRows) {
      const defaultPath = user.id.replace(/-/g, "").slice(0, 8);
      if (defaultPath === orgPath) {
        userId = user.id;
        break;
      }
    }
  }

  if (!userId) {
    return null;
  }

  // Find project
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.user_id, userId),
        eq(projects.project_name, projectName),
        eq(projects.is_active, true)
      )
    );

  if (projectRows.length === 0) {
    return null;
  }

  return { project: projectRows[0]!, userId };
}

// POST translate strings
translateRouter.post(
  "/:orgPath/:projectName",
  rateLimitMiddleware,
  zValidator("param", translateParamSchema),
  zValidator("json", translationRequestSchema),
  async c => {
    const { orgPath, projectName } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await findProject(orgPath, projectName);

    if (!result) {
      return c.json(
        errorResponse("Project not found or inactive"),
        404
      );
    }

    const { project, userId } = result;

    // Get all glossary terms for this project
    const glossaryRows = await db
      .select({ term: glossaries.term })
      .from(glossaries)
      .where(eq(glossaries.project_id, project.id));

    const glossaryTerms = glossaryRows.map(row => row.term);

    // Extract terms found in the input strings
    const foundTerms = extractGlossaryTerms(body.strings, glossaryTerms);

    // Build the glossary callback URL
    const glossaryCallbackUrl = buildGlossaryCallbackUrl(orgPath, projectName);

    // Calculate metrics
    const stringCount = body.strings.length;
    const characterCount = body.strings.reduce((acc, s) => acc + s.length, 0);

    try {
      // Call the translation service
      const translationResult = await translateStrings({
        target_languages: body.target_languages,
        strings: body.strings,
        glossaries: foundTerms,
        glossary_callback_url: glossaryCallbackUrl,
      });

      // Log successful usage
      await db.insert(usageRecords).values({
        user_id: userId,
        project_id: project.id,
        request_count: 1,
        string_count: stringCount,
        character_count: characterCount,
        success: true,
      });

      const response: TranslationResponse = {
        translations: translationResult.translations,
        glossaries_used: foundTerms,
        request_id: crypto.randomUUID(),
      };

      return c.json(successResponse(response));
    } catch (error) {
      // Log failed usage
      await db.insert(usageRecords).values({
        user_id: userId,
        project_id: project.id,
        request_count: 1,
        string_count: stringCount,
        character_count: characterCount,
        success: false,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });

      return c.json(
        errorResponse(
          error instanceof Error
            ? `Translation failed: ${error.message}`
            : "Translation failed"
        ),
        500
      );
    }
  }
);

// GET glossary lookup (callback endpoint for translation service)
translateRouter.get(
  "/glossary/:orgPath/:projectName",
  zValidator("param", glossaryLookupParamSchema),
  zValidator("query", glossaryLookupQuerySchema),
  async c => {
    const { orgPath, projectName } = c.req.valid("param");
    const { glossary, languages } = c.req.valid("query");

    const result = await findProject(orgPath, projectName);

    if (!result) {
      return c.json(
        errorResponse("Project not found or inactive"),
        404
      );
    }

    const { project } = result;

    // Find the glossary entry
    const glossaryRows = await db
      .select()
      .from(glossaries)
      .where(
        and(eq(glossaries.project_id, project.id), eq(glossaries.term, glossary))
      );

    if (glossaryRows.length === 0) {
      return c.json(errorResponse("Glossary term not found"), 404);
    }

    const glossaryEntry = glossaryRows[0]!;
    const requestedLanguages = languages.split(",").map(l => l.trim());

    // Build response with ALL requested languages (null if missing)
    const translations: Record<string, string | null> = {};
    for (const lang of requestedLanguages) {
      translations[lang] = glossaryEntry.translations[lang] ?? null;
    }

    const response: GlossaryLookupResponse = {
      glossary: glossaryEntry.term,
      translations,
    };

    return c.json(successResponse(response));
  }
);

export default translateRouter;
