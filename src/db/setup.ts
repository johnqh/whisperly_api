/**
 * Database setup script for Whisperly
 * Creates all required tables in the whisperly schema
 *
 * Run with: bun run src/db/setup.ts
 */
import postgres from "postgres";
import { getRequiredEnv } from "../lib/env-helper";
import { initEntityTables } from "@sudobility/entity_service";
import { initRateLimitTable } from "@sudobility/ratelimit_service";

const SCHEMA = "whisperly";
const INDEX_PREFIX = "whisperly";

async function setup() {
  const connectionString = getRequiredEnv("DATABASE_URL");
  const client = postgres(connectionString);

  console.log("Starting database setup...");

  try {
    // Create schema
    console.log(`Creating schema ${SCHEMA}...`);
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

    // Create users table (firebase_uid is primary key)
    console.log("Creating users table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.users (
        firebase_uid VARCHAR(128) PRIMARY KEY,
        email VARCHAR(255),
        display_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create user_settings table
    console.log("Creating user_settings table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.user_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES ${SCHEMA}.users(firebase_uid) ON DELETE CASCADE,
        organization_name VARCHAR(255),
        organization_path VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create entity tables (entities, entity_members, entity_invitations)
    console.log("Creating entity tables...");
    await initEntityTables(client, SCHEMA, INDEX_PREFIX);

    // Create projects table
    console.log("Creating projects table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES ${SCHEMA}.entities(id) ON DELETE CASCADE,
        project_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        instructions TEXT,
        default_source_language VARCHAR(10),
        default_target_languages JSONB,
        ip_allowlist JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_PREFIX}_unique_project_per_entity
      ON ${SCHEMA}.projects (entity_id, project_name)
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_projects_entity_idx
      ON ${SCHEMA}.projects (entity_id)
    `);

    // Create project_languages table
    console.log("Creating project_languages table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.project_languages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL UNIQUE REFERENCES ${SCHEMA}.projects(id) ON DELETE CASCADE,
        languages TEXT NOT NULL DEFAULT 'en',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_project_languages_project_idx
      ON ${SCHEMA}.project_languages (project_id)
    `);

    // Create dictionary table
    console.log("Creating dictionary table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.dictionary (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES ${SCHEMA}.entities(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES ${SCHEMA}.projects(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_dictionary_project_idx
      ON ${SCHEMA}.dictionary (project_id)
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_dictionary_entity_idx
      ON ${SCHEMA}.dictionary (entity_id)
    `);

    // Create dictionary_entry table
    console.log("Creating dictionary_entry table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.dictionary_entry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dictionary_id UUID NOT NULL REFERENCES ${SCHEMA}.dictionary(id) ON DELETE CASCADE,
        language_code VARCHAR(10) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_PREFIX}_unique_lang_per_dict
      ON ${SCHEMA}.dictionary_entry (dictionary_id, language_code)
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_dict_entry_dict_idx
      ON ${SCHEMA}.dictionary_entry (dictionary_id)
    `);

    // Create usage_records table
    console.log("Creating usage_records table...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.usage_records (
        uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES ${SCHEMA}.entities(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES ${SCHEMA}.projects(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        request_count INTEGER NOT NULL DEFAULT 1,
        string_count INTEGER NOT NULL,
        character_count INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT
      )
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS ${INDEX_PREFIX}_idx_usage_entity_timestamp
      ON ${SCHEMA}.usage_records (entity_id, timestamp)
    `);

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_usage_project_timestamp
      ON ${SCHEMA}.usage_records (project_id, timestamp)
    `);

    // Create rate_limit_counters table
    console.log("Creating rate_limit_counters table...");
    await initRateLimitTable(client as any, SCHEMA, INDEX_PREFIX);

    console.log("Database setup completed successfully!");
  } catch (error) {
    console.error("Database setup failed:", error);
    throw error;
  } finally {
    await client.end();
  }
}

setup();
