/**
 * Unit-test setup. Loaded by `bun run test` — the script CI runs.
 *
 * No database is reachable from here: the guard deletes DATABASE_URL, and
 * vitest.config.ts excludes every *.db.test.ts file from collection.
 *
 * Replaces a block of `process.env.X = process.env.X || "..."` defaults. Those
 * applied only when a variable was unset, so an exported production
 * DATABASE_URL won. Assignments are now unconditional: tests define their
 * environment rather than inheriting it.
 */
import { scrubDatabaseUrl } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";
process.env.BUN_ENV = "test";

scrubDatabaseUrl();

process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
process.env.TRANSLATION_SERVICE_URL = "http://localhost:8080/translate";
