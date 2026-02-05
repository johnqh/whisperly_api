// Test setup file for Bun test runner
// This file is preloaded before tests run (configured in bunfig.toml)

// Set test environment
process.env.NODE_ENV = "test";
process.env.BUN_ENV = "test";

// Mock environment variables for testing
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/whisperly_test";
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "test-project";
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || "test@test.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
process.env.TRANSLATION_SERVICE_URL = process.env.TRANSLATION_SERVICE_URL || "http://localhost:8080/translate";

console.log("Test environment initialized");
