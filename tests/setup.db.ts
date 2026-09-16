/**
 * Database-test setup. Loaded by `bun run test:db` only — never by CI.
 *
 * Throws unless TEST_DATABASE_URL names a localhost database, then publishes it
 * as DATABASE_URL for the application code to read.
 *
 * This repo has no *.db.test.ts files yet. The wiring exists so the first one
 * added lands correctly.
 */
import { setupTestDatabase } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";
process.env.BUN_ENV = "test";

setupTestDatabase();

process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
process.env.TRANSLATION_SERVICE_URL = "http://localhost:8080/translate";
