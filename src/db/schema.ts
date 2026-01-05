import {
  pgSchema,
  pgEnum,
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
// Enums
// =============================================================================

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "starter",
  "pro",
  "enterprise",
]);

// =============================================================================
// Users Table
// =============================================================================

export const users = whisperlySchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebase_uid: varchar("firebase_uid", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  display_name: varchar("display_name", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Entity Tables (from @sudobility/entity_service)
// =============================================================================

export const entities = createEntitiesTable(whisperlySchema, "whisperly");
export const entityMembers = createEntityMembersTable(whisperlySchema, "whisperly");
export const entityInvitations = createEntityInvitationsTable(whisperlySchema, "whisperly");

// =============================================================================
// User Settings Table (DEPRECATED - will be removed after entity migration)
// =============================================================================

export const userSettings = whisperlySchema.table("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  organization_name: varchar("organization_name", { length: 255 }),
  organization_path: varchar("organization_path", { length: 255 })
    .notNull()
    .unique(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Projects Table
// =============================================================================

export const projects = whisperlySchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entity_id: uuid("entity_id").references(() => entities.id, { onDelete: "cascade" }),
    project_name: varchar("project_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    instructions: text("instructions"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueProjectPerUser: uniqueIndex("unique_project_per_user").on(
      table.user_id,
      table.project_name
    ),
    entityIdx: index("whisperly_projects_entity_idx").on(table.entity_id),
  })
);

// =============================================================================
// Glossaries Table
// =============================================================================

export const glossaries = whisperlySchema.table(
  "glossaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    term: varchar("term", { length: 500 }).notNull(),
    translations: jsonb("translations").notNull().$type<Record<string, string>>(),
    context: text("context"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueTermPerProject: uniqueIndex("unique_term_per_project").on(
      table.project_id,
      table.term
    ),
  })
);

// =============================================================================
// Subscriptions Table
// =============================================================================

export const subscriptions = whisperlySchema.table("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  tier: subscriptionTierEnum("tier").notNull(),
  revenuecat_entitlement: varchar("revenuecat_entitlement", { length: 255 }).notNull(),
  monthly_request_limit: integer("monthly_request_limit").notNull(),
  hourly_request_limit: integer("hourly_request_limit").notNull(),
  requests_this_month: integer("requests_this_month").notNull().default(0),
  requests_this_hour: integer("requests_this_hour").notNull().default(0),
  month_reset_at: timestamp("month_reset_at"),
  hour_reset_at: timestamp("hour_reset_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Usage Records Table
// =============================================================================

export const usageRecords = whisperlySchema.table(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    userTimestampIdx: index("idx_usage_user_timestamp").on(
      table.user_id,
      table.timestamp
    ),
    projectTimestampIdx: index("idx_usage_project_timestamp").on(
      table.project_id,
      table.timestamp
    ),
  })
);

// =============================================================================
// Rate Limit Counters Table (from @sudobility/subscription_service)
// =============================================================================

export const rateLimitCounters = createRateLimitCountersTable(
  whisperlySchema,
  "whisperly"
);
