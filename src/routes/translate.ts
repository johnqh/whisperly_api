import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, projects, endpoints, glossaries, usageRecords } from "../db";
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
 * Returns project, entity, and optional endpoint
 */
async function findProjectAndEndpoint(
  orgPath: string,
  projectName: string,
  endpointName: string
) {
  // First find entity by slug
  const entity = await findEntityBySlug(orgPath);
  if (!entity) {
    return { error: "Organization not found", project: null, entity: null, endpoint: null };
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
    return { error: "Project not found or inactive", project: null, entity: null, endpoint: null };
  }

  const project = projectRows[0]!;

  // Find endpoint by name within project
  const endpointRows = await db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.project_id, project.id),
        eq(endpoints.endpoint_name, endpointName),
        eq(endpoints.is_active, true)
      )
    );

  if (endpointRows.length === 0) {
    return { error: "Endpoint not found or inactive", project: null, entity: null, endpoint: null };
  }

  const endpoint = endpointRows[0]!;

  return { project, entity, endpoint, error: null };
}

/**
 * Helper to find project for glossary lookup (backward compat - no endpoint needed)
 */
async function findProjectForGlossary(orgPath: string, projectName: string) {
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

// POST translate strings - NEW ROUTE with endpointName
// Route: /translate/:orgPath/:projectName/:endpointName
translateRouter.post(
  "/:orgPath/:projectName/:endpointName",
  rateLimitMiddleware,
  zValidator("param", translateParamSchema),
  zValidator("json", translationRequestSchema),
  async c => {
    const { orgPath, projectName, endpointName } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await findProjectAndEndpoint(orgPath, projectName, endpointName);

    if (result.error || !result.project || !result.entity || !result.endpoint) {
      return c.json(errorResponse(result.error || "Not found"), 404);
    }

    const { project, entity, endpoint } = result;

    // Validate IP allowlist (if configured on endpoint)
    const ipAllowlist = endpoint.ip_allowlist as string[] | null;
    if (ipAllowlist && ipAllowlist.length > 0) {
      const clientIp = getClientIp(c);
      if (!isIpAllowed(clientIp, ipAllowlist)) {
        return c.json(
          errorResponse(`IP address ${clientIp ?? "unknown"} is not allowed to access this endpoint`),
          403
        );
      }
    }

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

    // Use endpoint's default target languages if not specified
    const targetLanguages = body.target_languages.length > 0
      ? body.target_languages
      : (endpoint.default_target_languages as string[] | null) ?? [];

    if (targetLanguages.length === 0) {
      return c.json(
        errorResponse("No target languages specified and no defaults configured on endpoint"),
        400
      );
    }

    try {
      // Call the translation service
      // Note: Instructions from project/endpoint are not passed to translation service
      // as the TranslationServicePayload type doesn't support them yet
      const translationResult = await translateStrings({
        target_languages: targetLanguages,
        strings: body.strings,
        glossaries: foundTerms,
        glossary_callback_url: glossaryCallbackUrl,
      });

      // Log successful usage with entity context
      await db.insert(usageRecords).values({
        entity_id: entity.id,
        project_id: project.id,
        endpoint_id: endpoint.id,
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
      // Log failed usage with entity context
      await db.insert(usageRecords).values({
        entity_id: entity.id,
        project_id: project.id,
        endpoint_id: endpoint.id,
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
// Route: /translate/glossary/:orgPath/:projectName
translateRouter.get(
  "/glossary/:orgPath/:projectName",
  zValidator("param", glossaryLookupParamSchema),
  zValidator("query", glossaryLookupQuerySchema),
  async c => {
    const { orgPath, projectName } = c.req.valid("param");
    const { glossary, languages } = c.req.valid("query");

    const result = await findProjectForGlossary(orgPath, projectName);

    if (result.error || !result.project) {
      return c.json(errorResponse(result.error || "Not found"), 404);
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
