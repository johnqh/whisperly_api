import { getRequiredEnv, getEnv } from "../lib/env-helper";
import type {
  TranslationServicePayload,
  TranslationServiceResponse,
} from "@sudobility/whisperly_types";

/**
 * Call the external translation service
 */
export async function translateStrings(
  payload: TranslationServicePayload
): Promise<TranslationServiceResponse> {
  const translationServiceUrl = getRequiredEnv("TRANSLATION_SERVICE_URL");
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
      throw new Error(
        `Translation service error: ${response.status} - ${errorText}`
      );
    }

    return (await response.json()) as TranslationServiceResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Translation service request timed out");
    }
    throw error;
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
