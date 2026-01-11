import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initRateLimitTable } from "@sudobility/ratelimit_service";
import { runEntityMigration } from "@sudobility/entity_service";

const connectionString = getRequiredEnv("DATABASE_URL");

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export async function initDatabase() {
  // Create schema if it doesn't exist
  await client`CREATE SCHEMA IF NOT EXISTS whisperly`;

  // Create enums (if they don't exist)
  await client`
    DO $$ BEGIN
      CREATE TYPE whisperly.subscription_tier AS ENUM ('starter', 'pro', 'enterprise');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // Create tables
  await client`
    CREATE TABLE IF NOT EXISTS whisperly.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL UNIQUE,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES whisperly.users(id) ON DELETE CASCADE,
      firebase_uid VARCHAR(128) REFERENCES whisperly.users(firebase_uid) ON DELETE CASCADE,
      organization_name VARCHAR(255),
      organization_path VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add firebase_uid column if it doesn't exist (for existing databases)
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'whisperly'
        AND table_name = 'user_settings'
        AND column_name = 'firebase_uid'
      ) THEN
        ALTER TABLE whisperly.user_settings
        ADD COLUMN firebase_uid VARCHAR(128) REFERENCES whisperly.users(firebase_uid) ON DELETE CASCADE;
      END IF;
    END $$;
  `;

  // Populate firebase_uid from users table for existing records
  await client`
    UPDATE whisperly.user_settings s
    SET firebase_uid = u.firebase_uid
    FROM whisperly.users u
    WHERE s.user_id = u.id
    AND s.firebase_uid IS NULL
  `;

  // Note: entity_id added here; entity_service migration skipped due to type mismatch
  // (projects.user_id is UUID, entity_members.user_id is VARCHAR)
  await client`
    CREATE TABLE IF NOT EXISTS whisperly.projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES whisperly.users(id) ON DELETE CASCADE,
      entity_id UUID,
      project_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      instructions TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, project_name)
    )
  `;

  // Add entity_id column if it doesn't exist (for existing databases)
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'whisperly'
        AND table_name = 'projects'
        AND column_name = 'entity_id'
      ) THEN
        ALTER TABLE whisperly.projects ADD COLUMN entity_id UUID;
      END IF;
    END $$;
  `;

  // Create index on projects.entity_id
  await client`
    CREATE INDEX IF NOT EXISTS whisperly_projects_entity_idx
    ON whisperly.projects (entity_id)
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.glossaries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES whisperly.projects(id) ON DELETE CASCADE,
      term VARCHAR(500) NOT NULL,
      translations JSONB NOT NULL,
      context TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, term)
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES whisperly.users(id) ON DELETE CASCADE,
      tier whisperly.subscription_tier NOT NULL,
      revenuecat_entitlement VARCHAR(255) NOT NULL,
      monthly_request_limit INTEGER NOT NULL,
      hourly_request_limit INTEGER NOT NULL,
      requests_this_month INTEGER NOT NULL DEFAULT 0,
      requests_this_hour INTEGER NOT NULL DEFAULT 0,
      month_reset_at TIMESTAMP,
      hour_reset_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS whisperly.usage_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES whisperly.users(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_usage_user_timestamp
    ON whisperly.usage_records(user_id, timestamp DESC)
  `;

  await client`
    CREATE INDEX IF NOT EXISTS idx_usage_project_timestamp
    ON whisperly.usage_records(project_id, timestamp DESC)
  `;

  // Rate limit counters table (from @sudobility/subscription_service)
  await initRateLimitTable(client, "whisperly", "whisperly");

  // Entity tables and migration (from @sudobility/entity_service)
  // Note: migrateProjects disabled because projects.user_id is UUID but
  // entity_members.user_id is VARCHAR (firebase_uid). entity_id column
  // is added manually above.
  await runEntityMigration({
    client,
    schemaName: "whisperly",
    indexPrefix: "whisperly",
    migrateProjects: false,
  });

  console.log("Database tables initialized");
}

export async function closeDatabase() {
  await client.end();
}

// Re-export schema for convenience
export * from "./schema";
