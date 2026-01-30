import { getRequiredEnv, getEnv } from "../lib/env-helper";
import type {
  TranslationServicePayload,
  TranslationServiceResponse,
} from "@sudobility/whisperly_types";

/**
 * Custom error class that includes translation service request/response details
 */
export class TranslationServiceError extends Error {
  constructor(
    message: string,
    public readonly serviceUrl: string,
    public readonly requestPayload: TranslationServicePayload,
    public readonly responseStatus?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "TranslationServiceError";
  }

  toDetailedMessage(): string {
    const parts = [
      this.message,
      `\nService URL: ${this.serviceUrl}`,
      `\nRequest payload: ${JSON.stringify(this.requestPayload, null, 2)}`,
    ];
    if (this.responseStatus !== undefined) {
      parts.push(`\nResponse status: ${this.responseStatus}`);
    }
    if (this.responseBody) {
      parts.push(`\nResponse body: ${this.responseBody}`);
    }
    return parts.join("");
  }
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
 */
export async function translateStrings(
  payload: TranslationServicePayload
): Promise<TranslationServiceResponse> {
  const translationServiceUrl = getEnv("TRANSLATION_SERVICE_URL");
  const useMockFallback = getEnv("TRANSLATION_MOCK_FALLBACK") === "true";

  // If no URL configured, use mock in development
  if (!translationServiceUrl) {
    console.warn("TRANSLATION_SERVICE_URL not configured, using mock translations");
    return generateMockTranslations(payload);
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new TranslationServiceError(
        `Translation service error: ${response.status}`,
        translationServiceUrl,
        payload,
        response.status,
        errorText
      );
    }

    return (await response.json()) as TranslationServiceResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    // If mock fallback is enabled, return mock translations instead of failing
    if (useMockFallback) {
      console.warn("Translation service unavailable, using mock fallback:",
        error instanceof Error ? error.message : error);
      return generateMockTranslations(payload);
    }

    if (error instanceof TranslationServiceError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranslationServiceError(
        "Translation service request timed out",
        translationServiceUrl,
        payload
      );
    }
    // Wrap other errors with context
    throw new TranslationServiceError(
      error instanceof Error ? error.message : "Unknown error",
      translationServiceUrl,
      payload
    );
  }
}

/**
 * Build the dictionary callback URL for the translation service
 */
export function buildDictionaryCallbackUrl(
  orgPath: string,
  projectName: string
): string {
  const baseUrl = getEnv("API_BASE_URL", "http://localhost:3000");
  return `${baseUrl}/api/v1/dictionary/${orgPath}/${projectName}`;
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
