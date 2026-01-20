import { describe, expect, test, afterEach } from "vitest";
import {
  buildDictionaryCallbackUrl,
  extractDictionaryTerms,
} from "../../src/services/translation";

describe("buildDictionaryCallbackUrl", () => {
  const originalEnv = process.env.API_BASE_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.API_BASE_URL = originalEnv;
    } else {
      delete process.env.API_BASE_URL;
    }
  });

  test("builds correct URL with default base URL", () => {
    delete process.env.API_BASE_URL;
    const url = buildDictionaryCallbackUrl("my_org", "my-project");
    expect(url).toBe("http://localhost:3000/api/v1/dictionary/my_org/my-project");
  });

  test("builds correct URL with custom base URL", () => {
    process.env.API_BASE_URL = "https://api.example.com";
    const url = buildDictionaryCallbackUrl("org123", "project-name");
    expect(url).toBe(
      "https://api.example.com/api/v1/dictionary/org123/project-name"
    );
  });

  test("handles single character org path and project name", () => {
    delete process.env.API_BASE_URL;
    const url = buildDictionaryCallbackUrl("a", "b");
    expect(url).toBe("http://localhost:3000/api/v1/dictionary/a/b");
  });
});

describe("extractDictionaryTerms", () => {
  test("extracts matching terms from strings", () => {
    const strings = ["Hello World", "Welcome to the app"];
    const dictionaryTerms = ["Hello", "app", "missing"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toContain("Hello");
    expect(result).toContain("app");
    expect(result).not.toContain("missing");
    expect(result).toHaveLength(2);
  });

  test("performs case-insensitive matching", () => {
    const strings = ["HELLO world", "Welcome to the APP"];
    const dictionaryTerms = ["hello", "APP"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toContain("hello");
    expect(result).toContain("APP");
  });

  test("returns empty array when no terms match", () => {
    const strings = ["Hello World"];
    const dictionaryTerms = ["goodbye", "universe"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toEqual([]);
  });

  test("returns empty array for empty strings array", () => {
    const strings: string[] = [];
    const dictionaryTerms = ["hello"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toEqual([]);
  });

  test("returns empty array for empty dictionary terms", () => {
    const strings = ["Hello World"];
    const dictionaryTerms: string[] = [];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toEqual([]);
  });

  test("deduplicates terms found in multiple strings", () => {
    const strings = ["Hello there", "Hello again", "Hello once more"];
    const dictionaryTerms = ["Hello"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toEqual(["Hello"]);
  });

  test("matches terms that span word boundaries", () => {
    const strings = ["This is a substring test"];
    const dictionaryTerms = ["sub", "string"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toContain("sub");
    expect(result).toContain("string");
  });

  test("handles multi-word dictionary terms", () => {
    const strings = ["The quick brown fox jumps"];
    const dictionaryTerms = ["quick brown", "slow red"];

    const result = extractDictionaryTerms(strings, dictionaryTerms);

    expect(result).toContain("quick brown");
    expect(result).not.toContain("slow red");
  });
});
