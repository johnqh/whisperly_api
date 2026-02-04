/**
 * Fix personal entity member roles from 'manager' to 'owner'
 *
 * Run with: bun run scripts/fix-personal-entity-roles.ts
 */

import { db, entityMembers, entities } from "../src/db";
import { eq, and } from "drizzle-orm";

async function fixPersonalEntityRoles() {
  console.log("Finding personal entities with 'manager' role...");

  // Find all personal entity members with 'manager' role
  const membersToFix = await db
    .select({
      memberId: entityMembers.id,
      entityId: entityMembers.entity_id,
      userId: entityMembers.user_id,
      currentRole: entityMembers.role,
    })
    .from(entityMembers)
    .innerJoin(entities, eq(entityMembers.entity_id, entities.id))
    .where(
      and(
        eq(entities.entity_type, "personal"),
        eq(entityMembers.role, "manager")
      )
    );

  console.log(`Found ${membersToFix.length} members to fix`);

  if (membersToFix.length === 0) {
    console.log("No members need fixing. All personal entities already have 'owner' role.");
    return;
  }

  // Update each member to 'owner' role
  for (const member of membersToFix) {
    console.log(`Updating member ${member.userId} in entity ${member.entityId} from 'manager' to 'owner'`);
    await db
      .update(entityMembers)
      .set({ role: "owner" })
      .where(eq(entityMembers.id, member.memberId));
  }

  console.log(`Fixed ${membersToFix.length} personal entity member roles`);
}

fixPersonalEntityRoles()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
