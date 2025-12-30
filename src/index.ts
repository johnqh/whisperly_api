import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initDatabase } from "./db";
import routes from "./routes";
import { successResponse } from "@sudobility/whisperly_types";
import { getEnv } from "./lib/env-helper";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/", c => {
  return c.json(
    successResponse({
      name: "Whisperly API",
      version: "1.0.0",
      status: "healthy",
    })
  );
});

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
