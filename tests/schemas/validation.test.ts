import { describe, expect, test } from "vitest";
import {
  userIdParamSchema,
  entityProjectIdParamSchema,
  entityDictionaryIdParamSchema,
  translateParamSchema,
  projectCreateSchema,
  projectUpdateSchema,
  dictionaryCreateSchema,
  dictionaryUpdateSchema,
  settingsUpdateSchema,
  translationRequestSchema,
  analyticsQuerySchema,
  subscriptionTierSchema,
} from "../../src/schemas";

describe("userIdParamSchema", () => {
  test("accepts valid userId", () => {
    const result = userIdParamSchema.safeParse({ userId: "user123" });
    expect(result.success).toBe(true);
  });

  test("rejects empty userId", () => {
    const result = userIdParamSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  test("rejects userId over 128 characters", () => {
    const result = userIdParamSchema.safeParse({ userId: "a".repeat(129) });
    expect(result.success).toBe(false);
  });

  test("accepts userId at max length", () => {
    const result = userIdParamSchema.safeParse({ userId: "a".repeat(128) });
    expect(result.success).toBe(true);
  });
});

describe("entityProjectIdParamSchema", () => {
  test("accepts valid entitySlug and projectId UUID", () => {
    const result = entityProjectIdParamSchema.safeParse({
      entitySlug: "my-org",
      projectId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid UUID format", () => {
    const result = entityProjectIdParamSchema.safeParse({
      entitySlug: "my-org",
      projectId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("entityDictionaryIdParamSchema", () => {
  test("accepts valid entitySlug, projectId, and dictionaryId UUIDs", () => {
    const result = entityDictionaryIdParamSchema.safeParse({
      entitySlug: "my-org",
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      dictionaryId: "660e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("translateParamSchema", () => {
  test("accepts valid orgPath and projectName", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "my_org_123",
      projectName: "my-project",
    });
    expect(result.success).toBe(true);
  });

  test("accepts single character projectName", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "org",
      projectName: "a",
    });
    expect(result.success).toBe(true);
  });

  test("accepts orgPath with hyphens (entity slugs can have hyphens)", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "my-org",
      projectName: "project",
    });
    expect(result.success).toBe(true);
  });

  test("rejects projectName starting with hyphen", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "org",
      projectName: "-project",
    });
    expect(result.success).toBe(false);
  });

  test("rejects projectName ending with hyphen", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "org",
      projectName: "project-",
    });
    expect(result.success).toBe(false);
  });

  test("rejects projectName with uppercase letters", () => {
    const result = translateParamSchema.safeParse({
      orgPath: "org",
      projectName: "MyProject",
    });
    expect(result.success).toBe(false);
  });

  test("requires both orgPath and projectName to be present", () => {
    const result1 = translateParamSchema.safeParse({
      orgPath: "org",
    });
    expect(result1.success).toBe(false);

    const result2 = translateParamSchema.safeParse({
      projectName: "project",
    });
    expect(result2.success).toBe(false);
  });
});

describe("projectCreateSchema", () => {
  test("accepts valid project data", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "my-project",
      display_name: "My Project",
      description: "A test project",
      instructions: "Some instructions",
    });
    expect(result.success).toBe(true);
  });

  test("accepts minimal project data", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "p",
      display_name: "P",
    });
    expect(result.success).toBe(true);
  });

  test("rejects project_name with uppercase", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "MyProject",
      display_name: "My Project",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty display_name", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "project",
      display_name: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects description over 1000 characters", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "project",
      display_name: "Project",
      description: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  test("rejects instructions over 10000 characters", () => {
    const result = projectCreateSchema.safeParse({
      project_name: "project",
      display_name: "Project",
      instructions: "a".repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

describe("projectUpdateSchema", () => {
  test("accepts partial update", () => {
    const result = projectUpdateSchema.safeParse({
      display_name: "New Name",
    });
    expect(result.success).toBe(true);
  });

  test("accepts is_active field", () => {
    const result = projectUpdateSchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty object", () => {
    const result = projectUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("dictionaryCreateSchema", () => {
  test("accepts valid dictionary translations", () => {
    const result = dictionaryCreateSchema.safeParse({
      en: "Hello",
      es: "Hola",
      fr: "Bonjour",
    });
    expect(result.success).toBe(true);
  });

  test("accepts single language entry", () => {
    const result = dictionaryCreateSchema.safeParse({
      es: "Mundo",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty translation text", () => {
    const result = dictionaryCreateSchema.safeParse({
      en: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects language code under 2 characters", () => {
    const result = dictionaryCreateSchema.safeParse({
      e: "Hola",
    });
    expect(result.success).toBe(false);
  });

  test("rejects language code over 10 characters", () => {
    const result = dictionaryCreateSchema.safeParse({
      verylonglang: "Hola",
    });
    expect(result.success).toBe(false);
  });
});

describe("dictionaryUpdateSchema", () => {
  test("accepts partial update", () => {
    const result = dictionaryUpdateSchema.safeParse({
      de: "Hallo",
    });
    expect(result.success).toBe(true);
  });

  test("accepts multiple language updates", () => {
    const result = dictionaryUpdateSchema.safeParse({
      de: "Hallo",
      it: "Ciao",
    });
    expect(result.success).toBe(true);
  });
});

describe("settingsUpdateSchema", () => {
  test("accepts valid settings", () => {
    const result = settingsUpdateSchema.safeParse({
      organization_name: "My Org",
      organization_path: "my_org_123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects organization_path with hyphens", () => {
    const result = settingsUpdateSchema.safeParse({
      organization_path: "my-org",
    });
    expect(result.success).toBe(false);
  });

  test("rejects organization_path with spaces", () => {
    const result = settingsUpdateSchema.safeParse({
      organization_path: "my org",
    });
    expect(result.success).toBe(false);
  });
});

describe("translationRequestSchema", () => {
  test("accepts valid translation request", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello", "World"],
      target_languages: ["es", "fr"],
      source_language: "en",
    });
    expect(result.success).toBe(true);
  });

  test("accepts request without source_language", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello"],
      target_languages: ["es"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty strings array", () => {
    const result = translationRequestSchema.safeParse({
      strings: [],
      target_languages: ["es"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects strings array over 1000 items", () => {
    const result = translationRequestSchema.safeParse({
      strings: Array(1001).fill("test"),
      target_languages: ["es"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty target_languages", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello"],
      target_languages: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects target_languages over 50 items", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello"],
      target_languages: Array(51).fill("es"),
    });
    expect(result.success).toBe(false);
  });

  test("rejects language code under 2 characters", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello"],
      target_languages: ["e"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects language code over 10 characters", () => {
    const result = translationRequestSchema.safeParse({
      strings: ["Hello"],
      target_languages: ["a".repeat(11)],
    });
    expect(result.success).toBe(false);
  });
});

describe("analyticsQuerySchema", () => {
  test("accepts valid date range", () => {
    const result = analyticsQuerySchema.safeParse({
      start_date: "2024-01-01",
      end_date: "2024-12-31",
    });
    expect(result.success).toBe(true);
  });

  test("accepts with project_id filter", () => {
    const result = analyticsQuerySchema.safeParse({
      project_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty query", () => {
    const result = analyticsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("rejects invalid date format", () => {
    const result = analyticsQuerySchema.safeParse({
      start_date: "01-01-2024",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid project_id format", () => {
    const result = analyticsQuerySchema.safeParse({
      project_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("subscriptionTierSchema", () => {
  test("accepts starter tier", () => {
    const result = subscriptionTierSchema.safeParse("starter");
    expect(result.success).toBe(true);
  });

  test("accepts pro tier", () => {
    const result = subscriptionTierSchema.safeParse("pro");
    expect(result.success).toBe(true);
  });

  test("accepts enterprise tier", () => {
    const result = subscriptionTierSchema.safeParse("enterprise");
    expect(result.success).toBe(true);
  });

  test("rejects invalid tier", () => {
    const result = subscriptionTierSchema.safeParse("basic");
    expect(result.success).toBe(false);
  });
});
