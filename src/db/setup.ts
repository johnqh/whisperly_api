/**
 * Database setup script for Whisperly
 *
 * Delegates to initDatabase() to avoid duplicating schema creation logic.
 * Run with: bun run src/db/setup.ts
 */
import { initDatabase, closeDatabase } from "./index";

async function setup() {
  console.log("Starting database setup...");

  try {
    await initDatabase();
    console.log("Database setup completed successfully!");
  } catch (error) {
    console.error("Database setup failed:", error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

setup();
