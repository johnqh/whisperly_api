import { getEnv } from "../lib/env-helper";
import type {
  TranslationServicePayload,
  TranslationServiceResponse,
} from "@sudobility/whisperly_types";

/**
 * Debug info for translation service calls
 */
export interface TranslationDebugInfo {
  translation_service_url: string | null;
  payload: TranslationServicePayload | null;
  response: unknown | null;
}

/**
 * Result of a translation service call
 */
export interface TranslationResult {
  success: boolean;
  data?: TranslationServiceResponse;
  error?: string;
  debug: TranslationDebugInfo;
}

/**
 * Generate mock translations for development when translation service is unavailable
 */
function generateMockTranslations(
  payload: TranslationServicePayload
): TranslationServiceResponse {
  // Return the original text with a [lang] prefix for each target language
  const translations = payload.texts.map(text =>
    payload.target_language_codes.map(lang => `[${lang}] ${text}`)
  );

  return {
    translations,
    detected_source_language: payload.source_language_code || "en",
  };
}

/**
 * Call the external translation service
 * Returns a result object with debug info always included
 */
export async function translateStrings(
  payload: TranslationServicePayload
): Promise<TranslationResult> {
  const translationServiceUrl = getEnv("TRANSLATION_SERVICE_URL");
  const useMockFallback = getEnv("TRANSLATION_MOCK_FALLBACK") === "true";

  const debug: TranslationDebugInfo = {
    translation_service_url: translationServiceUrl || null,
    payload,
    response: null,
  };

  // If no URL configured, use mock in development
  if (!translationServiceUrl) {
    console.warn("TRANSLATION_SERVICE_URL not configured, using mock translations");
    const mockData = generateMockTranslations(payload);
    debug.response = mockData;
    return { success: true, data: mockData, debug };
  }

  const timeout = parseInt(getEnv("TRANSLATION_SERVICE_TIMEOUT", "120000")!);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(translationServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();

    // Try to parse as JSON for debug info
    let responseJson: unknown = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // Keep as text if not valid JSON
      responseJson = responseText;
    }
    debug.response = responseJson;

    if (!response.ok) {
      return {
        success: false,
        error: `Translation service error: ${response.status}`,
        debug,
      };
    }

    // Validate response format
    if (!responseJson || typeof responseJson !== "object") {
      return {
        success: false,
        error: "Translation service returned invalid response format",
        debug,
      };
    }

    const typedResult = responseJson as Record<string, unknown>;

    // Handle nested response format: { success, data: { output: { translations, ... } } }
    let translationData: Record<string, unknown> = typedResult;
    if (typedResult.data && typeof typedResult.data === "object") {
      const dataObj = typedResult.data as Record<string, unknown>;
      if (dataObj.output && typeof dataObj.output === "object") {
        translationData = dataObj.output as Record<string, unknown>;
      } else {
        translationData = dataObj;
      }
    }

    if (!Array.isArray(translationData.translations)) {
      return {
        success: false,
        error: `Translation service response missing 'translations' array (got ${typeof translationData.translations})`,
        debug,
      };
    }

    return {
      success: true,
      data: translationData as unknown as TranslationServiceResponse,
      debug,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // If mock fallback is enabled, return mock translations instead of failing
    if (useMockFallback) {
      console.warn("Translation service unavailable, using mock fallback:",
        error instanceof Error ? error.message : error);
      const mockData = generateMockTranslations(payload);
      debug.response = mockData;
      return { success: true, data: mockData, debug };
    }

    const errorMessage = error instanceof Error && error.name === "AbortError"
      ? "Translation service request timed out"
      : error instanceof Error ? error.message : "Unknown error";

    return {
      success: false,
      error: errorMessage,
      debug,
    };
  }
}

/**
 * Extract dictionary terms from strings based on project dictionary entries
 */
export function extractDictionaryTerms(
  strings: string[],
  dictionaryTerms: string[]
): string[] {
  const foundTerms = new Set<string>();
  const combinedText = strings.join(" ").toLowerCase();

  for (const term of dictionaryTerms) {
    if (combinedText.includes(term.toLowerCase())) {
      foundTerms.add(term);
    }
  }

  return Array.from(foundTerms);
}
