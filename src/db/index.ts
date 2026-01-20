import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initRateLimitTable } from "@sudobility/ratelimit_service";
import { runEntityMigration } from "@sudobility/entity_service";

// Lazy-initialized database connection
let _client: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getClient(): Sql {
  if (!_client) {
    const connectionString = getRequiredEnv("DATABASE_URL");
    _client = postgres(connectionString);
  }
  return _client;
}

// Export db as a getter to ensure lazy initialization
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_, prop) {
      if (!_db) {
        _db = drizzle(getClient(), { schema });
      }
      return (_db as any)[prop];
    },
  }
);

export async function initDatabase() {
  const client = getClient();

  // Create schema if it doesn't exist
  await client`CREATE SCHEMA IF NOT EXISTS whisperly`;

  // Create enums (if they don't exist)
  await client`
    DO $$ BEGIN
      CREATE TYPE whisperly.http_method AS ENUM ('GET', 'POST');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // =============================================================================
  // Step 1: Create users and user_settings tables
  // firebase_uid is now the primary key
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.users (
      firebase_uid VARCHAR(128) PRIMARY KEY,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES whisperly.users(firebase_uid) ON DELETE CASCADE,
      organization_name VARCHAR(255),
      organization_path VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // =============================================================================
  // Step 2: Run entity migration (creates entities, entity_members tables)
  // This must happen BEFORE tables that reference entities.id
  // =============================================================================

  await runEntityMigration({
    client,
    schemaName: "whisperly",
    indexPrefix: "whisperly",
    migrateProjects: false, // Tables are created fresh with entity_id
    migrateUsers: false, // Personal entities created on-demand via EntityHelper
  });

  // =============================================================================
  // Step 3: Create projects table (references entities.id)
  // Projects belong to entities, not users
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES whisperly.entities(id) ON DELETE CASCADE,
      project_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      instructions TEXT,
      default_source_language VARCHAR(10),
      default_target_languages JSONB,
      ip_allowlist JSONB,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add new columns to existing projects table (if they don't exist)
  await client`
    DO $$ BEGIN
      ALTER TABLE whisperly.projects ADD COLUMN IF NOT EXISTS default_source_language VARCHAR(10);
      ALTER TABLE whisperly.projects ADD COLUMN IF NOT EXISTS default_target_languages JSONB;
      ALTER TABLE whisperly.projects ADD COLUMN IF NOT EXISTS ip_allowlist JSONB;
    EXCEPTION
      WHEN duplicate_column THEN null;
    END $$;
  `;

  // Create unique index for project_name per entity
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS whisperly_unique_project_per_entity
    ON whisperly.projects(entity_id, project_name)
  `;

  // Create index on projects.entity_id
  await client`
    CREATE INDEX IF NOT EXISTS whisperly_projects_entity_idx
    ON whisperly.projects (entity_id)
  `;

  // =============================================================================
  // Step 4: Create dictionary tables
  // =============================================================================

  // Drop old glossaries table if it exists
  await client`DROP TABLE IF EXISTS whisperly.glossaries CASCADE`;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.dictionary (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES whisperly.entities(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES whisperly.projects(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create indexes for dictionary
  await client`
    CREATE INDEX IF NOT EXISTS whisperly_dictionary_project_idx
    ON whisperly.dictionary (project_id)
  `;

  await client`
    CREATE INDEX IF NOT EXISTS whisperly_dictionary_entity_idx
    ON whisperly.dictionary (entity_id)
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.dictionary_entry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dictionary_id UUID NOT NULL REFERENCES whisperly.dictionary(id) ON DELETE CASCADE,
      language_code VARCHAR(10) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(dictionary_id, language_code)
    )
  `;

  // Create index for dictionary_entry lookups
  await client`
    CREATE INDEX IF NOT EXISTS whisperly_dict_entry_dict_idx
    ON whisperly.dictionary_entry (dictionary_id)
  `;

  // =============================================================================
  // Step 5: Drop endpoints table (no longer needed)
  // =============================================================================

  await client`DROP TABLE IF EXISTS whisperly.endpoints CASCADE`;

  // =============================================================================
  // Step 6: Create usage_records table
  // =============================================================================

  // Remove endpoint_id column if it exists (migrating from old schema)
  await client`
    DO $$ BEGIN
      ALTER TABLE whisperly.usage_records DROP COLUMN IF EXISTS endpoint_id;
    EXCEPTION
      WHEN undefined_column THEN null;
    END $$;
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.usage_records (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES whisperly.entities(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES whisperly.projects(id) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      request_count INTEGER NOT NULL DEFAULT 1,
      string_count INTEGER NOT NULL,
      character_count INTEGER NOT NULL,
      success BOOLEAN NOT NULL,
      error_message TEXT
    )
  `;

  // Create indexes for analytics queries
  await client`
    CREATE INDEX IF NOT EXISTS whisperly_idx_usage_entity_timestamp
    ON whisperly.usage_records(entity_id, timestamp DESC)
  `;

  await client`
    CREATE INDEX IF NOT EXISTS idx_usage_project_timestamp
    ON whisperly.usage_records(project_id, timestamp DESC)
  `;

  // =============================================================================
  // Step 7: Rate limit counters table
  // =============================================================================

  await initRateLimitTable(client, "whisperly", "whisperly");

  console.log("Database tables initialized");
}

export async function closeDatabase() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

// Re-export schema for convenience
export * from "./schema";
