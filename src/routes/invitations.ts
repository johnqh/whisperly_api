/**
 * @fileoverview User Invitation Routes
 * @description API routes for managing user's pending invitations
 */

import { Hono } from "hono";
import { db, entities, entityMembers, entityInvitations, users } from "../db";
import { createEntityHelpers } from "@sudobility/entity_service";
import type { InvitationHelperConfig } from "@sudobility/entity_service";

// Create entity helpers with whisperly schema
const config: InvitationHelperConfig = {
  db: db as any,
  entitiesTable: entities,
  membersTable: entityMembers,
  invitationsTable: entityInvitations,
  usersTable: users,
};

const helpers = createEntityHelpers(config);

type Variables = {
  userId: string;
  userEmail: string | null;
};

const invitationsRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /invitations - List pending invitations for the current user
 */
invitationsRouter.get("/", async (c) => {
  const userEmail = c.get("userEmail");

  if (!userEmail) {
    return c.json({ success: true, data: [] });
  }

  try {
    const invitations = await helpers.invitations.getUserPendingInvitations(userEmail);
    return c.json({ success: true, data: invitations });
  } catch (error: any) {
    console.error("Error listing user invitations:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /invitations/:token/accept - Accept an invitation
 */
invitationsRouter.post("/:token/accept", async (c) => {
  const userId = c.get("userId");
  const token = c.req.param("token");

  try {
    await helpers.invitations.acceptInvitation(token, userId);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return c.json({ success: false, error: error.message }, 400);
  }
});

/**
 * POST /invitations/:token/decline - Decline an invitation
 */
invitationsRouter.post("/:token/decline", async (c) => {
  const token = c.req.param("token");

  try {
    await helpers.invitations.declineInvitation(token);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error declining invitation:", error);
    return c.json({ success: false, error: error.message }, 400);
  }
});

export default invitationsRouter;
