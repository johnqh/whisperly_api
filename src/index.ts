import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initDatabase } from "./db";
import routes from "./routes";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";
import { getEnv } from "./lib/env-helper";

const app = new Hono();

// Global error handler - return detailed JSON errors instead of plain text
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Unknown error";
  const stack = err instanceof Error ? err.stack : undefined;

  // In development, include stack trace
  const isDev = getEnv("NODE_ENV") !== "production";

  return c.json(
    errorResponse(isDev && stack ? `${message}\n\n${stack}` : message),
    500
  );
});

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check endpoints
const healthResponse = {
  name: "Whisperly API",
  version: "1.0.0",
  status: "healthy",
};

app.get("/", c => c.json(successResponse(healthResponse)));
app.get("/health", c => c.json(successResponse(healthResponse)));

// API routes
app.route("/api/v1", routes);

// Initialize database and start server
const port = parseInt(getEnv("PORT", "3000")!);

initDatabase()
  .then(() => {
    console.log(`Whisperly API running on http://localhost:${port}`);
  })
  .catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

export default {
  port,
  fetch: app.fetch,
};

// Export app for testing
export { app };
