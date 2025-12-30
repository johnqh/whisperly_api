import { Hono } from "hono";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import projectsRouter from "./projects";
import glossariesRouter from "./glossaries";
import settingsRouter from "./settings";
import analyticsRouter from "./analytics";
import subscriptionRouter from "./subscription";
import translateRouter from "./translate";
import ratelimitsRouter from "./ratelimits";

const routes = new Hono();

// Consumer routes (public, no auth) - MUST be registered before admin routes
// to avoid wildcard middleware interception
routes.route("/translate", translateRouter);

// Admin routes (Firebase auth required)
const adminRoutes = new Hono();
adminRoutes.use("*", firebaseAuthMiddleware);
adminRoutes.route("/users/:userId/projects", projectsRouter);
adminRoutes.route(
  "/users/:userId/projects/:projectId/glossaries",
  glossariesRouter
);
adminRoutes.route("/users/:userId/settings", settingsRouter);
adminRoutes.route("/users/:userId/analytics", analyticsRouter);
adminRoutes.route("/users/:userId/subscription", subscriptionRouter);
adminRoutes.route("/ratelimits", ratelimitsRouter);
routes.route("/", adminRoutes);

export default routes;

// Also export individual routers for testing
export {
  projectsRouter,
  glossariesRouter,
  settingsRouter,
  analyticsRouter,
  subscriptionRouter,
  translateRouter,
  ratelimitsRouter,
};
