import { describe, expect, test, beforeEach, afterEach } from "vitest";
import {
  buildGlossaryCallbackUrl,
  extractGlossaryTerms,
} from "../../src/services/translation";

describe("buildGlossaryCallbackUrl", () => {
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
    const url = buildGlossaryCallbackUrl("my_org", "my-project");
    expect(url).toBe("http://localhost:3000/api/v1/glossary/my_org/my-project");
  });

  test("builds correct URL with custom base URL", () => {
    process.env.API_BASE_URL = "https://api.example.com";
    const url = buildGlossaryCallbackUrl("org123", "project-name");
    expect(url).toBe(
      "https://api.example.com/api/v1/glossary/org123/project-name"
    );
  });

  test("handles single character org path and project name", () => {
    delete process.env.API_BASE_URL;
    const url = buildGlossaryCallbackUrl("a", "b");
    expect(url).toBe("http://localhost:3000/api/v1/glossary/a/b");
  });
});

describe("extractGlossaryTerms", () => {
  test("extracts matching terms from strings", () => {
    const strings = ["Hello World", "Welcome to the app"];
    const glossaryTerms = ["Hello", "app", "missing"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toContain("Hello");
    expect(result).toContain("app");
    expect(result).not.toContain("missing");
    expect(result).toHaveLength(2);
  });

  test("performs case-insensitive matching", () => {
    const strings = ["HELLO world", "Welcome to the APP"];
    const glossaryTerms = ["hello", "APP"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toContain("hello");
    expect(result).toContain("APP");
  });

  test("returns empty array when no terms match", () => {
    const strings = ["Hello World"];
    const glossaryTerms = ["goodbye", "universe"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toEqual([]);
  });

  test("returns empty array for empty strings array", () => {
    const strings: string[] = [];
    const glossaryTerms = ["hello"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toEqual([]);
  });

  test("returns empty array for empty glossary terms", () => {
    const strings = ["Hello World"];
    const glossaryTerms: string[] = [];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toEqual([]);
  });

  test("deduplicates terms found in multiple strings", () => {
    const strings = ["Hello there", "Hello again", "Hello once more"];
    const glossaryTerms = ["Hello"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toEqual(["Hello"]);
  });

  test("matches terms that span word boundaries", () => {
    const strings = ["This is a substring test"];
    const glossaryTerms = ["sub", "string"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toContain("sub");
    expect(result).toContain("string");
  });

  test("handles multi-word glossary terms", () => {
    const strings = ["The quick brown fox jumps"];
    const glossaryTerms = ["quick brown", "slow red"];

    const result = extractGlossaryTerms(strings, glossaryTerms);

    expect(result).toContain("quick brown");
    expect(result).not.toContain("slow red");
  });
});
