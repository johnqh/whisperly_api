/**
 * @fileoverview Firebase authentication service using auth_service
 */

import {
  initializeAuth,
  createCachedVerifier,
  getUserInfo as getFirebaseUserInfo,
  isSiteAdmin,
  isAnonymousUser,
} from "@sudobility/auth_service";
import { getRequiredEnv, getEnv } from "../lib/env-helper";

// Initialize auth_service once at module load
// Skip in test mode to avoid requiring Firebase credentials
const isTestMode = getEnv("NODE_ENV") === "test" || getEnv("BUN_ENV") === "test";

if (!isTestMode) {
  initializeAuth({
    firebase: {
      projectId: getRequiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getRequiredEnv("FIREBASE_PRIVATE_KEY"),
    },
    siteAdminEmails: getEnv("SITEADMIN_EMAILS"),
  });
}

// Create cached verifier with 5 minute TTL
const cachedVerifier = createCachedVerifier(300000);

/**
 * Verify a Firebase ID token with caching.
 * Throws in test mode.
 */
export async function verifyIdToken(token: string) {
  if (isTestMode) {
    throw new Error("Firebase verification not available in test mode");
  }
  return cachedVerifier.verify(token);
}

// Re-export helpers
export { isSiteAdmin, isAnonymousUser };
export { getFirebaseUserInfo as getUserInfo };
