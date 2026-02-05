import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createRateLimitCountersTable } from "@sudobility/ratelimit_service";
import {
  createEntitiesTable,
  createEntityMembersTable,
  createEntityInvitationsTable,
} from "@sudobility/entity_service";

// Create the whisperly schema
export const whisperlySchema = pgSchema("whisperly");

// =============================================================================
// Users Table
// firebase_uid is the primary key - no internal UUID needed
// =============================================================================

export const users = whisperlySchema.table("users", {
  firebase_uid: varchar("firebase_uid", { length: 128 }).primaryKey(),
  email: varchar("email", { length: 255 }),
  display_name: varchar("display_name", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// User Settings Table
// =============================================================================

export const userSettings = whisperlySchema.table("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebase_uid: varchar("firebase_uid", { length: 128 })
    .notNull()
    .references(() => users.firebase_uid, { onDelete: "cascade" })
    .unique(),
  organization_name: varchar("organization_name", { length: 255 }),
  organization_path: varchar("organization_path", { length: 255 })
    .notNull()
    .unique(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Entity Tables (from @sudobility/entity_service)
// Must be defined before tables that reference them
// =============================================================================

export const entities = createEntitiesTable(whisperlySchema, "whisperly");
export const entityMembers = createEntityMembersTable(whisperlySchema, "whisperly");
export const entityInvitations = createEntityInvitationsTable(whisperlySchema, "whisperly");

// =============================================================================
// Projects Table
// Projects belong to entities, not users
// =============================================================================

export const projects = whisperlySchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    project_name: varchar("project_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    instructions: text("instructions"),
    default_source_language: varchar("default_source_language", { length: 10 }),
    default_target_languages: jsonb("default_target_languages").$type<string[]>(),
    ip_allowlist: jsonb("ip_allowlist").$type<string[]>(),
    api_key: varchar("api_key", { length: 255 }),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    // Entity-based unique constraint (projects are unique within an entity)
    uniqueProjectPerEntity: uniqueIndex("whisperly_unique_project_per_entity").on(
      table.entity_id,
      table.project_name
    ),
    entityIdx: index("whisperly_projects_entity_idx").on(table.entity_id),
  })
);

// =============================================================================
// Project Languages Table
// Stores selected target languages for a project
// =============================================================================

export const projectLanguages = whisperlySchema.table(
  "project_languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" })
      .unique(),
    languages: text("languages").notNull().default("en"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    projectIdx: index("whisperly_project_languages_project_idx").on(table.project_id),
  })
);

// =============================================================================
// Dictionary Table
// Groups related translation entries together
// =============================================================================

export const dictionary = whisperlySchema.table(
  "dictionary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    projectIdx: index("whisperly_dictionary_project_idx").on(table.project_id),
    entityIdx: index("whisperly_dictionary_entity_idx").on(table.entity_id),
  })
);

// =============================================================================
// Dictionary Entry Table
// Individual language translations within a dictionary
// =============================================================================

export const dictionaryEntry = whisperlySchema.table(
  "dictionary_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionary_id: uuid("dictionary_id")
      .notNull()
      .references(() => dictionary.id, { onDelete: "cascade" }),
    language_code: varchar("language_code", { length: 10 }).notNull(),
    text: text("text").notNull(),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    // One entry per language per dictionary
    uniqueLangPerDict: uniqueIndex("whisperly_unique_lang_per_dict").on(
      table.dictionary_id,
      table.language_code
    ),
    dictIdx: index("whisperly_dict_entry_dict_idx").on(table.dictionary_id),
  })
);

// =============================================================================
// Usage Records Table
// =============================================================================

export const usageRecords = whisperlySchema.table(
  "usage_records",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    request_count: integer("request_count").notNull().default(1),
    string_count: integer("string_count").notNull(),
    character_count: integer("character_count").notNull(),
    success: boolean("success").notNull(),
    error_message: text("error_message"),
  },
  table => ({
    entityTimestampIdx: index("whisperly_idx_usage_entity_timestamp").on(
      table.entity_id,
      table.timestamp
    ),
    projectTimestampIdx: index("idx_usage_project_timestamp").on(
      table.project_id,
      table.timestamp
    ),
  })
);

// =============================================================================
// Rate Limit Counters Table (from @sudobility/ratelimit_service)
// =============================================================================

export const rateLimitCounters = createRateLimitCountersTable(
  whisperlySchema,
  "whisperly"
);
