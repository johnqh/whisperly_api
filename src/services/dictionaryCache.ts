/**
 * Dictionary Cache Service
 *
 * Provides in-memory caching of dictionary entries for efficient term matching
 * during translation. The cache is lazy-loaded per project and invalidated
 * when dictionary entries are created, updated, or deleted.
 *
 * Cache entries also expire after a configurable TTL (default: 5 minutes)
 * to handle out-of-band database changes (e.g., Drizzle Studio, migrations).
 */

import { db, dictionary, dictionaryEntry } from "../db";
import { eq, and } from "drizzle-orm";
import { getEnv } from "../lib/env-helper";

// =============================================================================
// Types
// =============================================================================

interface ProjectDictionaryCache {
  /** dictionary_id -> language_code -> text */
  dictionary_map: Map<string, Map<string, string>>;
  /** lowercase_text -> dictionary_id */
  text_map: Map<string, string>;
  /** Terms sorted by length (longest first) for matching */
  terms_sorted: string[];
  /** Timestamp when cache was loaded */
  loaded_at: number;
}

export interface TermMatch {
  /** The matched term (original case from input) */
  term: string;
  /** Start index in the original string */
  start: number;
  /** End index in the original string */
  end: number;
  /** The dictionary ID for this term */
  dictionaryId: string;
}

// =============================================================================
// Cache Storage
// =============================================================================

/** Cache TTL in milliseconds. Default: 5 minutes. Configurable via DICTIONARY_CACHE_TTL_MS env var. */
const CACHE_TTL_MS = parseInt(
  getEnv("DICTIONARY_CACHE_TTL_MS", "300000") ?? "300000"
);

/** Global cache: "entityId:projectId" -> ProjectDictionaryCache */
const projectCaches = new Map<string, ProjectDictionaryCache>();

function getCacheKey(entityId: string, projectId: string): string {
  return `${entityId}:${projectId}`;
}

/**
 * Check if a cache entry has expired based on its loaded_at timestamp.
 */
function isCacheExpired(cache: ProjectDictionaryCache): boolean {
  return Date.now() - cache.loaded_at > CACHE_TTL_MS;
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Load dictionary cache from database for a project
 */
async function loadProjectCache(
  entityId: string,
  projectId: string
): Promise<ProjectDictionaryCache> {
  // Query all dictionary entries for this project
  const entries = await db
    .select({
      dictionary_id: dictionaryEntry.dictionary_id,
      language_code: dictionaryEntry.language_code,
      text: dictionaryEntry.text,
    })
    .from(dictionaryEntry)
    .innerJoin(dictionary, eq(dictionaryEntry.dictionary_id, dictionary.id))
    .where(
      and(
        eq(dictionary.entity_id, entityId),
        eq(dictionary.project_id, projectId)
      )
    );

  // Build the maps
  const dictionary_map = new Map<string, Map<string, string>>();
  const text_map = new Map<string, string>();

  for (const entry of entries) {
    // Build dictionary_map: dictionary_id -> language_code -> text
    if (!dictionary_map.has(entry.dictionary_id)) {
      dictionary_map.set(entry.dictionary_id, new Map());
    }
    dictionary_map
      .get(entry.dictionary_id)!
      .set(entry.language_code, entry.text);

    // Build text_map: lowercase_text -> dictionary_id
    // All language variations are keys (to detect terms in any input language)
    const lowerText = entry.text.toLowerCase();
    if (!text_map.has(lowerText)) {
      text_map.set(lowerText, entry.dictionary_id);
    }
  }

  // Sort terms by length (longest first) for matching
  const terms_sorted = Array.from(text_map.keys()).sort(
    (a, b) => b.length - a.length
  );

  return {
    dictionary_map,
    text_map,
    terms_sorted,
    loaded_at: Date.now(),
  };
}

/**
 * Get dictionary cache for a project (lazy loading with TTL expiration).
 * Cache entries are refreshed if they exceed the configured TTL,
 * in addition to being invalidated on dictionary mutations.
 */
export async function getProjectCache(
  entityId: string,
  projectId: string
): Promise<ProjectDictionaryCache> {
  const key = getCacheKey(entityId, projectId);
  const existing = projectCaches.get(key);

  if (!existing || isCacheExpired(existing)) {
    const cache = await loadProjectCache(entityId, projectId);
    projectCaches.set(key, cache);
    return cache;
  }

  return existing;
}

/**
 * Invalidate dictionary cache for a project
 * Call this after CREATE, UPDATE, or DELETE operations on dictionary entries
 */
export function invalidateProjectCache(
  entityId: string,
  projectId: string
): void {
  const key = getCacheKey(entityId, projectId);
  projectCaches.delete(key);
}

// =============================================================================
// Term Matching
// =============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find all dictionary terms in a text string
 * Uses whole-word matching, case-insensitive, longest match first
 */
export function findDictionaryTerms(
  text: string,
  cache: ProjectDictionaryCache
): TermMatch[] {
  const matches: TermMatch[] = [];
  const usedRanges: Array<{ start: number; end: number }> = [];

  // Check if a range overlaps with any already-matched range
  const overlaps = (start: number, end: number): boolean => {
    return usedRanges.some(range => start < range.end && end > range.start);
  };

  // Iterate through terms (longest first)
  for (const termLower of cache.terms_sorted) {
    // Build regex for whole-word matching
    // Use word boundary \b for ASCII, but also handle non-ASCII gracefully
    const escapedTerm = escapeRegex(termLower);
    const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if this range overlaps with an already-matched term
      if (overlaps(start, end)) {
        continue;
      }

      // Record the match
      const dictionaryId = cache.text_map.get(termLower)!;
      matches.push({
        term: match[0], // Original case from input
        start,
        end,
        dictionaryId,
      });
      usedRanges.push({ start, end });
    }
  }

  // Sort by position for consistent processing
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Wrap matched terms with double curly brackets
 * Replaces from end to start to preserve indices
 */
export function wrapTermsWithBrackets(
  text: string,
  matches: TermMatch[]
): string {
  // Sort by position descending (replace from end first)
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

  let result = text;
  for (const match of sortedMatches) {
    result =
      result.slice(0, match.start) +
      `{{${match.term}}}` +
      result.slice(match.end);
  }

  return result;
}

/**
 * Unwrap bracketed terms and replace with dictionary translations
 * @param translatedText - Text containing {{term}} placeholders
 * @param matches - Original matches with dictionary IDs
 * @param targetLanguage - Target language code
 * @param cache - Project dictionary cache
 */
export function unwrapAndTranslate(
  translatedText: string,
  matches: TermMatch[],
  targetLanguage: string,
  cache: ProjectDictionaryCache
): string {
  let result = translatedText;

  for (const match of matches) {
    // Find the bracketed term in the translated text
    // Use case-insensitive search since the term might be in the original
    const bracketedTerm = `{{${match.term}}}`;
    const bracketedTermLower = bracketedTerm.toLowerCase();

    // Find position (case-insensitive)
    const lowerResult = result.toLowerCase();
    const pos = lowerResult.indexOf(bracketedTermLower);

    if (pos === -1) {
      // Term not found (might have been modified by translation service)
      continue;
    }

    // Get dictionary translation for target language
    const langMap = cache.dictionary_map.get(match.dictionaryId);
    let replacement: string;

    if (langMap && langMap.has(targetLanguage)) {
      // Use dictionary translation
      replacement = langMap.get(targetLanguage)!;
    } else {
      // No translation available - keep original term (without brackets)
      replacement = match.term;
    }

    // Replace the bracketed term with the translation
    result =
      result.slice(0, pos) +
      replacement +
      result.slice(pos + bracketedTerm.length);
  }

  return result;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if the cache is empty (no dictionary terms)
 */
export function isCacheEmpty(cache: ProjectDictionaryCache): boolean {
  return cache.terms_sorted.length === 0;
}

/**
 * Get cache statistics (for debugging/monitoring)
 */
export function getCacheStats(): {
  projectCount: number;
  projects: Array<{ key: string; termCount: number; loadedAt: number }>;
} {
  const projects = Array.from(projectCaches.entries()).map(([key, cache]) => ({
    key,
    termCount: cache.terms_sorted.length,
    loadedAt: cache.loaded_at,
  }));

  return {
    projectCount: projectCaches.size,
    projects,
  };
}

/**
 * Serialize cache to plain objects for debug/API responses
 */
export function serializeCache(cache: ProjectDictionaryCache): {
  text_map: Record<string, string>;
  dictionary_map: Record<string, Record<string, string>>;
} {
  const text_map: Record<string, string> = {};
  for (const [text, dictId] of cache.text_map) {
    text_map[text] = dictId;
  }

  const dictionary_map: Record<string, Record<string, string>> = {};
  for (const [dictId, langMap] of cache.dictionary_map) {
    const langs: Record<string, string> = {};
    for (const [lang, text] of langMap) {
      langs[lang] = text;
    }
    dictionary_map[dictId] = langs;
  }

  return { text_map, dictionary_map };
}

/**
 * Clear all caches (for testing or memory management)
 */
export function clearAllCaches(): void {
  projectCaches.clear();
}
