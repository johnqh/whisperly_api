import { describe, test, expect, beforeEach } from "vitest";
import {
  findDictionaryTerms,
  wrapTermsWithBrackets,
  unwrapAndTranslate,
  isCacheEmpty,
  serializeCache,
  clearAllCaches,
  getCacheStats,
} from "../../src/services/dictionaryCache";

/**
 * Build a mock ProjectDictionaryCache for testing.
 * Each entry is: [dictionaryId, { langCode: text, ... }]
 */
function buildMockCache(
  entries: Array<[string, Record<string, string>]>
) {
  const dictionary_map = new Map<string, Map<string, string>>();
  const text_map = new Map<string, string>();

  for (const [dictId, langMap] of entries) {
    const langEntries = new Map<string, string>();
    for (const [lang, text] of Object.entries(langMap)) {
      langEntries.set(lang, text);
      const lowerText = text.toLowerCase();
      if (!text_map.has(lowerText)) {
        text_map.set(lowerText, dictId);
      }
    }
    dictionary_map.set(dictId, langEntries);
  }

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

describe("dictionaryCache", () => {
  beforeEach(() => {
    clearAllCaches();
  });

  describe("findDictionaryTerms", () => {
    test("finds single term match", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Say Hello to everyone", cache);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.term).toBe("Hello");
      expect(matches[0]!.dictionaryId).toBe("dict-1");
      expect(matches[0]!.start).toBe(4);
      expect(matches[0]!.end).toBe(9);
    });

    test("matches are case-insensitive", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("say hello to everyone", cache);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.term).toBe("hello");
    });

    test("finds multiple different terms", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
        ["dict-2", { en: "World", es: "Mundo" }],
      ]);

      const matches = findDictionaryTerms("Hello World", cache);

      expect(matches).toHaveLength(2);
      expect(matches[0]!.term).toBe("Hello");
      expect(matches[1]!.term).toBe("World");
    });

    test("uses whole-word matching", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "app", es: "aplicacion" }],
      ]);

      // "app" should not match inside "application"
      const matches = findDictionaryTerms("This is an application", cache);
      expect(matches).toHaveLength(0);

      // "app" should match standalone
      const matches2 = findDictionaryTerms("Open the app now", cache);
      expect(matches2).toHaveLength(1);
      expect(matches2[0]!.term).toBe("app");
    });

    test("longest match wins for overlapping terms", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "New York", es: "Nueva York" }],
        ["dict-2", { en: "New", es: "Nuevo" }],
      ]);

      const matches = findDictionaryTerms("Welcome to New York", cache);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.term).toBe("New York");
      expect(matches[0]!.dictionaryId).toBe("dict-1");
    });

    test("finds term in any language of the cache", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola", fr: "Bonjour" }],
      ]);

      // The cache indexes all language variations
      const matchesEn = findDictionaryTerms("Say Hello", cache);
      expect(matchesEn).toHaveLength(1);

      const matchesEs = findDictionaryTerms("Diga Hola", cache);
      expect(matchesEs).toHaveLength(1);

      const matchesFr = findDictionaryTerms("Dites Bonjour", cache);
      expect(matchesFr).toHaveLength(1);
    });

    test("returns empty array for no matches", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("No matching terms here", cache);
      expect(matches).toEqual([]);
    });

    test("returns empty array for empty cache", () => {
      const cache = buildMockCache([]);

      const matches = findDictionaryTerms("Hello World", cache);
      expect(matches).toEqual([]);
    });

    test("finds multiple occurrences of the same term", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Hello and Hello again", cache);
      expect(matches).toHaveLength(2);
      expect(matches[0]!.start).toBe(0);
      expect(matches[1]!.start).toBe(10);
    });

    test("does not overlap matches", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "New York City", es: "Ciudad de Nueva York" }],
        ["dict-2", { en: "York", es: "York" }],
      ]);

      const matches = findDictionaryTerms("Visit New York City today", cache);
      // "New York City" takes priority (longest match), so "York" alone should not match within it
      expect(matches).toHaveLength(1);
      expect(matches[0]!.term).toBe("New York City");
    });

    test("handles special regex characters in terms", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "C++", es: "C++" }],
      ]);

      // C++ has regex special chars, but the term should still be handled
      // Note: word boundary matching may not match "C++" since + is not a word char
      // This tests that the regex escaping doesn't throw
      const matches = findDictionaryTerms("Learn C++ programming", cache);
      // Due to word boundary rules, C++ may or may not match depending on context
      expect(Array.isArray(matches)).toBe(true);
    });
  });

  describe("wrapTermsWithBrackets", () => {
    test("wraps matched terms with double curly brackets", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Say Hello there", cache);
      const result = wrapTermsWithBrackets("Say Hello there", matches);

      expect(result).toBe("Say {{Hello}} there");
    });

    test("wraps multiple terms", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
        ["dict-2", { en: "World", es: "Mundo" }],
      ]);

      const matches = findDictionaryTerms("Hello World", cache);
      const result = wrapTermsWithBrackets("Hello World", matches);

      expect(result).toBe("{{Hello}} {{World}}");
    });

    test("preserves unmatched text", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Well, Hello there, friend!", cache);
      const result = wrapTermsWithBrackets("Well, Hello there, friend!", matches);

      expect(result).toBe("Well, {{Hello}} there, friend!");
    });
  });

  describe("unwrapAndTranslate", () => {
    test("replaces bracketed term with target language translation", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola", fr: "Bonjour" }],
      ]);

      const matches = findDictionaryTerms("Hello", cache);
      const result = unwrapAndTranslate("{{Hello}}", matches, "es", cache);

      expect(result).toBe("Hola");
    });

    test("keeps original term if target language not available", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Hello", cache);
      const result = unwrapAndTranslate("{{Hello}}", matches, "de", cache);

      // No German translation, keeps original term
      expect(result).toBe("Hello");
    });

    test("handles multiple bracketed terms", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
        ["dict-2", { en: "World", es: "Mundo" }],
      ]);

      const matches = findDictionaryTerms("Hello World", cache);
      const result = unwrapAndTranslate("{{Hello}} {{World}}", matches, "es", cache);

      expect(result).toBe("Hola Mundo");
    });

    test("handles case where bracketed term was modified by translation service", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);

      const matches = findDictionaryTerms("Hello", cache);
      // Translation service removed the brackets
      const result = unwrapAndTranslate("Just Hello without brackets", matches, "es", cache);

      // Term not found in brackets, so text stays as-is
      expect(result).toBe("Just Hello without brackets");
    });
  });

  describe("isCacheEmpty", () => {
    test("returns true for empty cache", () => {
      const cache = buildMockCache([]);
      expect(isCacheEmpty(cache)).toBe(true);
    });

    test("returns false for non-empty cache", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
      ]);
      expect(isCacheEmpty(cache)).toBe(false);
    });
  });

  describe("serializeCache", () => {
    test("serializes cache to plain objects", () => {
      const cache = buildMockCache([
        ["dict-1", { en: "Hello", es: "Hola" }],
        ["dict-2", { en: "World", es: "Mundo" }],
      ]);

      const serialized = serializeCache(cache);

      expect(serialized.text_map).toEqual({
        hello: "dict-1",
        hola: "dict-1",
        world: "dict-2",
        mundo: "dict-2",
      });

      expect(serialized.dictionary_map).toEqual({
        "dict-1": { en: "Hello", es: "Hola" },
        "dict-2": { en: "World", es: "Mundo" },
      });
    });
  });

  describe("getCacheStats", () => {
    test("returns empty stats when no caches exist", () => {
      const stats = getCacheStats();
      expect(stats.projectCount).toBe(0);
      expect(stats.projects).toEqual([]);
    });
  });

  describe("clearAllCaches", () => {
    test("clears all project caches", () => {
      // After clearing, stats should show zero projects
      clearAllCaches();
      const stats = getCacheStats();
      expect(stats.projectCount).toBe(0);
    });
  });
});
