/**
 * @fileoverview Shared entity helpers configuration
 * @description Provides a pre-configured entity helpers singleton used across all routes.
 * Consolidates the duplicated `createEntityHelpers(config)` calls from individual route files.
 */

import {
  createEntityHelpers,
  type InvitationHelperConfig,
} from "@sudobility/entity_service";
import { db, entities, entityMembers, entityInvitations, users } from "../db";

/**
 * Shared entity helpers configuration.
 * Uses the Drizzle ORM database instance and whisperly schema tables.
 */
const config: InvitationHelperConfig = {
  db: db as any,
  entitiesTable: entities,
  membersTable: entityMembers,
  invitationsTable: entityInvitations,
  usersTable: users,
};

/**
 * Pre-configured entity helpers singleton.
 * Provides access to entity, permissions, members, and invitations helpers.
 *
 * @example
 * ```typescript
 * import { entityHelpers } from "../lib/entity-config";
 *
 * const entity = await entityHelpers.entity.getEntityBySlug(slug);
 * const canEdit = await entityHelpers.permissions.canCreateProjects(entity.id, userId);
 * ```
 */
export const entityHelpers = createEntityHelpers(config);
