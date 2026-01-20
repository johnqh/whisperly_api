import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, sql } from "drizzle-orm";
import { db, entities, projects, dictionary, dictionaryEntry, usageRecords } from "../db";
import {
  translateParamSchema,
  translationRequestSchema,
  dictionaryLookupParamSchema,
  dictionaryLookupQuerySchema,
} from "../schemas";
import {
  successResponse,
  errorResponse,
  type TranslationResponse,
  type DictionaryLookupResponse,
} from "@sudobility/whisperly_types";
import {
  translateStrings,
  buildDictionaryCallbackUrl,
  extractDictionaryTerms,
} from "../services/translation";
import { rateLimitMiddleware } from "../middleware/rateLimit";

const translateRouter = new Hono();

/**
 * Helper to get client IP address from request
 */
function getClientIp(c: any): string | null {
  // Check common proxy headers first
  const xForwardedFor = c.req.header("X-Forwarded-For");
  if (xForwardedFor) {
    // X-Forwarded-For can be comma-separated list; take the first (client) IP
    return xForwardedFor.split(",")[0]?.trim() ?? null;
  }

  const xRealIp = c.req.header("X-Real-IP");
  if (xRealIp) {
    return xRealIp;
  }

  // Fallback to connection info if available
  return c.req.raw?.socket?.remoteAddress ?? null;
}

/**
 * Check if IP is in the allowlist
 */
function isIpAllowed(clientIp: string | null, allowlist: string[] | null): boolean {
  // If no allowlist is set, allow all
  if (!allowlist || allowlist.length === 0) {
    return true;
  }

  // If allowlist is set but no client IP, deny
  if (!clientIp) {
    return false;
  }

  return allowlist.includes(clientIp);
}

/**
 * Find entity by slug (organization path).
 * The organization path in the public API URL is now the entity slug.
 */
async function findEntityBySlug(
  entitySlug: string
): Promise<typeof entities.$inferSelect | null> {
  const entityRows = await db
    .select()
    .from(entities)
    .where(eq(entities.entity_slug, entitySlug));

  return entityRows[0] ?? null;
}

/**
 * Helper to find project by entity slug and project name
 * Returns project and entity
 */
async function findProject(orgPath: string, projectName: string) {
  // First find entity by slug
  const entity = await findEntityBySlug(orgPath);
  if (!entity) {
    return { error: "Organization not found", project: null, entity: null };
  }

  // Find project by name and entity
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.entity_id, entity.id),
        eq(projects.project_name, projectName),
        eq(projects.is_active, true)
      )
    );

  if (projectRows.length === 0) {
    return { error: "Project not found or inactive", project: null, entity: null };
  }

  return { project: projectRows[0]!, entity, error: null };
}

/**
 * Get all unique dictionary terms (texts) for a project
 */
async function getDictionaryTermsForProject(entityId: string, projectId: string): Promise<string[]> {
  const entries = await db
    .select({ text: dictionaryEntry.text })
    .from(dictionaryEntry)
    .innerJoin(dictionary, eq(dictionaryEntry.dictionary_id, dictionary.id))
    .where(
      and(
        eq(dictionary.entity_id, entityId),
        eq(dictionary.project_id, projectId)
      )
    );

  // Return unique terms
  return [...new Set(entries.map(e => e.text))];
}

// POST translate strings
// Route: /translate/:orgPath/:projectName
translateRouter.post(
  "/:orgPath/:projectName",
  rateLimitMiddleware,
  zValidator("param", translateParamSchema),
  zValidator("json", translationRequestSchema),
  async c => {
    const { orgPath, projectName } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await findProject(orgPath, projectName);

    if (result.error || !result.project || !result.entity) {
      return c.json(errorResponse(result.error || "Not found"), 404);
    }

    const { project, entity } = result;

    // Validate IP allowlist (if configured on project)
    const ipAllowlist = project.ip_allowlist as string[] | null;
    if (ipAllowlist && ipAllowlist.length > 0) {
      const clientIp = getClientIp(c);
      if (!isIpAllowed(clientIp, ipAllowlist)) {
        return c.json(
          errorResponse(`IP address ${clientIp ?? "unknown"} is not allowed to access this project`),
          403
        );
      }
    }

    // Get all dictionary terms for this project
    const dictionaryTerms = await getDictionaryTermsForProject(entity.id, project.id);

    // Extract terms found in the input strings
    const foundTerms = extractDictionaryTerms(body.strings, dictionaryTerms);

    // Build the dictionary callback URL
    const dictionaryCallbackUrl = buildDictionaryCallbackUrl(orgPath, projectName);

    // Calculate metrics
    const stringCount = body.strings.length;
    const characterCount = body.strings.reduce((acc, s) => acc + s.length, 0);

    // Use project's default target languages if not specified in request
    const targetLanguages = body.target_languages.length > 0
      ? body.target_languages
      : (project.default_target_languages as string[] | null) ?? [];

    if (targetLanguages.length === 0) {
      return c.json(
        errorResponse("No target languages specified and no defaults configured on project"),
        400
      );
    }

    try {
      // Call the translation service
      const translationResult = await translateStrings({
        target_languages: targetLanguages,
        strings: body.strings,
        dictionary_terms: foundTerms,
        dictionary_callback_url: dictionaryCallbackUrl,
      });

      // Log successful usage with entity context
      await db.insert(usageRecords).values({
        entity_id: entity.id,
        project_id: project.id,
        request_count: 1,
        string_count: stringCount,
        character_count: characterCount,
        success: true,
      });

      const response: TranslationResponse = {
        translations: translationResult.translations,
        dictionary_terms_used: foundTerms,
        request_id: crypto.randomUUID(),
      };

      return c.json(successResponse(response));
    } catch (error) {
      // Log failed usage with entity context
      await db.insert(usageRecords).values({
        entity_id: entity.id,
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

// GET dictionary lookup (callback endpoint for translation service)
// Route: /translate/dictionary/:orgPath/:projectName
translateRouter.get(
  "/dictionary/:orgPath/:projectName",
  zValidator("param", dictionaryLookupParamSchema),
  zValidator("query", dictionaryLookupQuerySchema),
  async c => {
    const { orgPath, projectName } = c.req.valid("param");
    const { term, languages } = c.req.valid("query");

    const result = await findProject(orgPath, projectName);

    if (result.error || !result.project || !result.entity) {
      return c.json(errorResponse(result.error || "Not found"), 404);
    }

    const { project, entity } = result;

    // Find dictionary entry by searching for the term (case-insensitive)
    const matchingEntries = await db
      .select({
        dictionary_id: dictionaryEntry.dictionary_id,
      })
      .from(dictionaryEntry)
      .innerJoin(dictionary, eq(dictionaryEntry.dictionary_id, dictionary.id))
      .where(
        and(
          eq(dictionary.entity_id, entity.id),
          eq(dictionary.project_id, project.id),
          sql`LOWER(${dictionaryEntry.text}) = LOWER(${term})`
        )
      )
      .limit(1);

    if (matchingEntries.length === 0) {
      return c.json(errorResponse("Dictionary term not found"), 404);
    }

    const dictionaryId = matchingEntries[0]!.dictionary_id;

    // Get all entries for this dictionary
    const allEntries = await db
      .select()
      .from(dictionaryEntry)
      .where(eq(dictionaryEntry.dictionary_id, dictionaryId));

    const requestedLanguages = languages.split(",").map(l => l.trim());

    // Build response with ALL requested languages (null if missing)
    const translations: Record<string, string | null> = {};
    for (const lang of requestedLanguages) {
      const entry = allEntries.find(e => e.language_code === lang);
      translations[lang] = entry?.text ?? null;
    }

    const response: DictionaryLookupResponse = {
      term,
      translations,
    };

    return c.json(successResponse(response));
  }
);

export default translateRouter;
