import { z } from "zod";

// =============================================================================
// Common Param Schemas
// =============================================================================

export const userIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
});

export const projectIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  projectId: z.string().uuid(),
});

export const glossaryIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  projectId: z.string().uuid(),
  glossaryId: z.string().uuid(),
});

export const translateParamSchema = z.object({
  orgPath: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Must contain only letters, numbers, and underscores"
    ),
  projectName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
});

export const glossaryLookupParamSchema = z.object({
  orgPath: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9_]+$/),
  projectName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
});

// =============================================================================
// Project Schemas
// =============================================================================

const projectNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export const projectCreateSchema = z.object({
  project_name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      projectNameRegex,
      "Must be lowercase alphanumeric with optional hyphens"
    ),
  display_name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(10000).optional(),
});

export const projectUpdateSchema = z.object({
  project_name: z.string().min(1).max(255).regex(projectNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(10000).optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Glossary Schemas
// =============================================================================

export const glossaryCreateSchema = z.object({
  term: z.string().min(1).max(500),
  translations: z.record(z.string(), z.string()),
  context: z.string().max(1000).optional(),
});

export const glossaryUpdateSchema = z.object({
  term: z.string().min(1).max(500).optional(),
  translations: z.record(z.string(), z.string()).optional(),
  context: z.string().max(1000).optional(),
});

// =============================================================================
// Settings Schemas
// =============================================================================

const organizationPathRegex = /^[a-zA-Z0-9_]+$/;

export const settingsUpdateSchema = z.object({
  organization_name: z.string().min(1).max(255).optional(),
  organization_path: z
    .string()
    .min(1)
    .max(255)
    .regex(
      organizationPathRegex,
      "Must contain only letters, numbers, and underscores"
    )
    .optional(),
});

// =============================================================================
// Translation Schemas
// =============================================================================

export const translationRequestSchema = z.object({
  strings: z.array(z.string()).min(1).max(1000),
  target_languages: z.array(z.string().min(2).max(10)).min(1).max(50),
  source_language: z.string().min(2).max(10).optional(),
});

export const glossaryLookupQuerySchema = z.object({
  glossary: z.string().min(1).max(500),
  languages: z.string().min(2), // comma-separated list
});

// =============================================================================
// Analytics Query Schema
// =============================================================================

export const analyticsQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  project_id: z.string().uuid().optional(),
});

// =============================================================================
// Subscription Schemas
// =============================================================================

export const subscriptionTierSchema = z.enum(["starter", "pro", "enterprise"]);
