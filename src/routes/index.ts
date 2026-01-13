import { Hono } from "hono";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import projectsRouter from "./projects";
import endpointsRouter from "./endpoints";
import glossariesRouter from "./glossaries";
import settingsRouter from "./settings";
import analyticsRouter from "./analytics";
import translateRouter from "./translate";
import ratelimitsRouter from "./ratelimits";
import entitiesRouter from "./entities";
import invitationsRouter from "./invitations";

const routes = new Hono();

// Consumer routes (public, no auth) - MUST be registered before admin routes
// to avoid wildcard middleware interception
routes.route("/translate", translateRouter);

// Admin routes (Firebase auth required)
const adminRoutes = new Hono();
adminRoutes.use("*", firebaseAuthMiddleware);

// Entity-centric routes (new structure - like shapeshyft)
adminRoutes.route("/entities/:entitySlug/projects", projectsRouter);
adminRoutes.route(
  "/entities/:entitySlug/projects/:projectId/endpoints",
  endpointsRouter
);
adminRoutes.route(
  "/entities/:entitySlug/projects/:projectId/glossaries",
  glossariesRouter
);
adminRoutes.route("/entities/:entitySlug/analytics", analyticsRouter);
adminRoutes.route("/ratelimits/:rateLimitUserId", ratelimitsRouter);

// Entity management routes
adminRoutes.route("/entities", entitiesRouter);
adminRoutes.route("/invitations", invitationsRouter);

// User-specific routes (not entity-based)
adminRoutes.route("/users/:userId/settings", settingsRouter);

routes.route("/", adminRoutes);

export default routes;

// Also export individual routers for testing
export {
  projectsRouter,
  endpointsRouter,
  glossariesRouter,
  settingsRouter,
  analyticsRouter,
  translateRouter,
  ratelimitsRouter,
  entitiesRouter,
  invitationsRouter,
};
