import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db, users, userSettings } from "../db";
import { settingsUpdateSchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type UserSettings,
} from "@sudobility/whisperly_types";

const settingsRouter = new Hono();

/**
 * Helper to get or create user by Firebase UID
 */
async function getOrCreateUser(firebaseUid: string, email?: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (existing.length > 0) {
    return existing[0]!;
  }

  const created = await db
    .insert(users)
    .values({
      firebase_uid: firebaseUid,
      email: email ?? null,
    })
    .returning();

  return created[0]!;
}

/**
 * Generate default organization path from user UUID
 * Uses first 8 characters of the UUID (without hyphens)
 */
function generateDefaultOrgPath(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

// GET user settings
settingsRouter.get("/", async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only access your own settings"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.user_id, user.id));

  if (rows.length === 0) {
    // Return default settings with auto-generated org path
    const defaultSettings: UserSettings = {
      id: null,
      user_id: user.id,
      organization_name: null,
      organization_path: generateDefaultOrgPath(user.id),
      is_default: true,
      created_at: null,
      updated_at: null,
    };
    return c.json(successResponse(defaultSettings));
  }

  const settings: UserSettings = { ...rows[0], is_default: false };
  return c.json(successResponse(settings));
});

// PUT create/update settings (upsert)
settingsRouter.put("/", zValidator("json", settingsUpdateSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");
  const body = c.req.valid("json");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only update your own settings"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  // Check if settings exist
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.user_id, user.id));

  // If changing organization_path, check for duplicates
  if (body.organization_path) {
    const duplicate = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.organization_path, body.organization_path));

    if (
      duplicate.length > 0 &&
      (existing.length === 0 || duplicate[0]!.user_id !== user.id)
    ) {
      return c.json(errorResponse("Organization path already taken"), 409);
    }
  }

  if (existing.length === 0) {
    // Create new settings
    const orgPath = body.organization_path || generateDefaultOrgPath(user.id);

    // Double-check the auto-generated path isn't taken
    if (!body.organization_path) {
      const autoPathCheck = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.organization_path, orgPath));

      if (autoPathCheck.length > 0) {
        return c.json(
          errorResponse(
            "Auto-generated organization path is taken. Please provide a custom organization_path."
          ),
          409
        );
      }
    }

    const rows = await db
      .insert(userSettings)
      .values({
        user_id: user.id,
        organization_name: body.organization_name ?? null,
        organization_path: orgPath,
      })
      .returning();

    const created: UserSettings = { ...rows[0]!, is_default: false };
    return c.json(successResponse(created), 201);
  }

  // Update existing settings
  const current = existing[0]!;
  const rows = await db
    .update(userSettings)
    .set({
      organization_name: body.organization_name ?? current.organization_name,
      organization_path: body.organization_path ?? current.organization_path,
      updated_at: new Date(),
    })
    .where(eq(userSettings.user_id, user.id))
    .returning();

  const updated: UserSettings = { ...rows[0]!, is_default: false };
  return c.json(successResponse(updated));
});

export default settingsRouter;
