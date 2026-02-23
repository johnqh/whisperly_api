/**
 * @fileoverview User routes for Whisperly API
 */

import { Hono } from "hono";
import { getUserInfo } from "../services/firebase";
import { successResponse, errorResponse } from "@sudobility/whisperly_types";

const usersRouter = new Hono();

/**
 * GET /users/:userId
 *
 * Get user information including siteAdmin status.
 * Requires the Firebase token to match the requested userId.
 * Returns 403 if token doesn't match or user not found.
 *
 * Note: This route is under adminRoutes which applies firebaseAuthMiddleware,
 * so c.get("userId") is already available.
 */
usersRouter.get("/:userId", async c => {
  const requestedUserId = c.req.param("userId");
  const tokenUserId = c.get("userId");

  // Verify the token belongs to the requested user
  if (requestedUserId !== tokenUserId) {
    return c.json(errorResponse("Token does not match requested user"), 403);
  }

  const userInfo = await getUserInfo(requestedUserId);

  if (!userInfo) {
    return c.json(errorResponse("User not found"), 403);
  }

  return c.json(successResponse(userInfo));
});

export default usersRouter;
