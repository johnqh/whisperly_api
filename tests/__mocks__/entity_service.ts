// Mock for @sudobility/entity_service
import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Create a mock entities table using real Drizzle pg-core primitives.
 * This allows schema.ts to resolve without errors in tests.
 */
export function createEntitiesTable(schema: ReturnType<typeof pgSchema>, _prefix: string) {
  return schema.table("entities", {
    id: uuid("id").primaryKey().defaultRandom(),
    entity_slug: varchar("entity_slug", { length: 255 }).notNull().unique(),
    entity_type: varchar("entity_type", { length: 50 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    avatar_url: varchar("avatar_url", { length: 500 }),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  });
}

export function createEntityMembersTable(schema: ReturnType<typeof pgSchema>, _prefix: string) {
  return schema.table("entity_members", {
    id: uuid("id").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id").notNull(),
    user_id: varchar("user_id", { length: 128 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  }, (table) => ({
    entityIdx: index("mock_entity_members_entity_idx").on(table.entity_id),
  }));
}

export function createEntityInvitationsTable(schema: ReturnType<typeof pgSchema>, _prefix: string) {
  return schema.table("entity_invitations", {
    id: uuid("id").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    invited_by: varchar("invited_by", { length: 128 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    expires_at: timestamp("expires_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  }, (table) => ({
    entityIdx: index("mock_entity_invitations_entity_idx").on(table.entity_id),
  }));
}

export interface InvitationHelperConfig {
  db: any;
  entitiesTable: any;
  membersTable: any;
  invitationsTable: any;
  usersTable: any;
}

export interface Entity {
  id: string;
  entity_slug: string;
  entity_type: string;
  display_name: string;
  description: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
  displayName: string;
}

export function createEntityHelpers(_config: InvitationHelperConfig) {
  return {
    entity: {
      getEntityBySlug: async (_slug: string): Promise<Entity | null> => null,
      getUserEntities: async (_userId: string, _email?: string) => [],
      createOrganizationEntity: async (_userId: string, _data: any) => ({}),
      updateEntity: async (_entityId: string, _data: any) => ({}),
      deleteEntity: async (_entityId: string) => {},
    },
    permissions: {
      canViewEntity: async (_entityId: string, _userId: string) => false,
      canEditEntity: async (_entityId: string, _userId: string) => false,
      canDeleteEntity: async (_entityId: string, _userId: string) => false,
      canCreateProjects: async (_entityId: string, _userId: string) => false,
      canManageMembers: async (_entityId: string, _userId: string) => false,
      canInviteMembers: async (_entityId: string, _userId: string) => false,
    },
    members: {
      isMember: async (_entityId: string, _userId: string) => false,
      getUserRole: async (_entityId: string, _userId: string) => null,
      getMembers: async (_entityId: string) => [],
      updateMemberRole: async (_entityId: string, _memberId: string, _role: string) => ({}),
      removeMember: async (_entityId: string, _memberId: string) => {},
    },
    invitations: {
      getEntityInvitations: async (_entityId: string) => [],
      getUserPendingInvitations: async (_email: string) => [],
      createInvitation: async (_entityId: string, _userId: string, _data: any) => ({}),
      acceptInvitation: async (_token: string, _userId: string) => {},
      declineInvitation: async (_token: string) => {},
      renewInvitation: async (_invitationId: string) => ({ email: "" }),
      cancelInvitation: async (_invitationId: string) => {},
    },
  };
}

export function initEntityTables() {
  return Promise.resolve();
}

export function runEntityMigration() {
  return Promise.resolve();
}
