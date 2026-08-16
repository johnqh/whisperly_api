/**
 * @fileoverview Placeholder integrity for translation results
 * @description Guarantees that no string leaves the API with a broken
 * placeholder set. Restoration alone repairs bracket damage, but a model that
 * drops or duplicates a token produces text no repair can reconstruct. This
 * module closes that gap: damaged strings are sent back to the model with
 * corrective instructions, and anything still damaged after the retry budget
 * falls back to the source text rather than shipping a broken placeholder.
 *
 * The retry call is injected, so this is reusable for any translation backend
 * and testable without a network.
 */

import {
  restorePlaceholders,
  hasUnrecoverableDamage,
  describeDamage,
  type RestoreResult,
} from "./placeholders";

/** Re-translate a subset of already-masked strings into one language. */
export type Retranslate = (
  maskedStrings: string[],
  language: string,
  problem: string
) => Promise<string[] | null>;

export interface RepairInput {
  /** Raw model output per language, index-aligned with `maskedStrings`. */
  translationsByLanguage: Record<string, string[]>;
  /** The masked strings that were sent to the model. */
  maskedStrings: string[];
  /** Per-string token maps produced by `maskPlaceholders`. */
  placeholderMaps: Map<string, string>[];
  /** Pre-mask strings, used as the last-resort fallback. */
  sourceStrings: string[];
  /** How many times a damaged string may be retried. Default 1. */
  maxAttempts?: number;
  onWarn?: (message: string) => void;
}

export interface RepairSummary {
  /** Strings whose brackets were repaired during restoration. */
  repaired: number;
  /** Strings sent back to the model. */
  retried: number;
  /** Retries that came back with an intact placeholder set. */
  recovered: number;
  /** Strings replaced with the source text because they stayed damaged. */
  fellBack: number;
}

interface Damaged {
  language: string;
  index: number;
  problem: string;
}

/**
 * Restore tokens across every language, retry what came back structurally
 * wrong, and fall back to source text for anything still broken.
 */
export async function restoreWithIntegrity(
  input: RepairInput,
  retranslate: Retranslate
): Promise<{ translations: Record<string, string[]>; summary: RepairSummary }> {
  const {
    translationsByLanguage,
    maskedStrings,
    placeholderMaps,
    sourceStrings,
    maxAttempts = 1,
    onWarn = () => {},
  } = input;

  const summary: RepairSummary = {
    repaired: 0,
    retried: 0,
    recovered: 0,
    fellBack: 0,
  };
  const translations: Record<string, string[]> = {};
  const damaged: Damaged[] = [];

  /** Restore one string, recording bracket repairs. */
  const restoreOne = (
    text: string,
    index: number
  ): { text: string; result: RestoreResult | null } => {
    const map = placeholderMaps[index];
    if (!map) return { text, result: null };
    const result = restorePlaceholders(text, map);
    return { text: result.text, result };
  };

  // Pass 1: restore everything, note what stayed broken.
  for (const [language, texts] of Object.entries(translationsByLanguage)) {
    translations[language] = texts.map((text, index) => {
      const { text: restored, result } = restoreOne(text, index);
      if (!result) return restored;
      if (result.repaired > 0) summary.repaired += 1;
      if (hasUnrecoverableDamage(result)) {
        const problem = describeDamage(result);
        damaged.push({ language, index, problem });
        onWarn(`[translate] ${language}[${index}] damaged: ${problem}`);
      }
      return restored;
    });
  }

  // Pass 2: retry the damaged strings, grouped per language so each retry is
  // one call rather than one per string.
  for (
    let attempt = 0;
    attempt < maxAttempts && damaged.length > 0;
    attempt++
  ) {
    const byLanguage = new Map<string, Damaged[]>();
    for (const item of damaged) {
      const list = byLanguage.get(item.language) ?? [];
      list.push(item);
      byLanguage.set(item.language, list);
    }
    damaged.length = 0;

    for (const [language, items] of byLanguage) {
      const indices = items.map(item => item.index);
      const problem = items.map(item => item.problem).join("; ");
      summary.retried += indices.length;

      let retried: string[] | null = null;
      try {
        retried = await retranslate(
          indices.map(index => maskedStrings[index]!),
          language,
          problem
        );
      } catch (error) {
        onWarn(
          `[translate] retry failed for ${language}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      indices.forEach((index, position) => {
        const candidate = retried?.[position];
        if (typeof candidate !== "string") {
          damaged.push({ language, index, problem });
          return;
        }
        const { text: restored, result } = restoreOne(candidate, index);
        if (result && hasUnrecoverableDamage(result)) {
          damaged.push({ language, index, problem: describeDamage(result) });
          return;
        }
        translations[language]![index] = restored;
        summary.recovered += 1;
      });
    }
  }

  // Pass 3: anything still damaged falls back to the source text. Untranslated
  // is recoverable for a caller; a broken placeholder is not.
  for (const { language, index, problem } of damaged) {
    const source = sourceStrings[index];
    if (typeof source !== "string") continue;
    translations[language]![index] = source;
    summary.fellBack += 1;
    onWarn(
      `[translate] ${language}[${index}] fell back to source text after ${maxAttempts} retry attempt(s): ${problem}`
    );
  }

  return { translations, summary };
}
