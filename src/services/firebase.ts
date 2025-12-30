import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import { getRequiredEnv, getEnv } from "../lib/env-helper";

let app: App | null = null;
let auth: Auth | null = null;

/**
 * Get or initialize the Firebase app and auth
 * Lazy initialization to support testing
 */
function getFirebaseAuth(): Auth {
  if (auth) {
    return auth;
  }

  if (getApps().length === 0) {
    const FIREBASE_PROJECT_ID = getRequiredEnv("FIREBASE_PROJECT_ID");
    const FIREBASE_CLIENT_EMAIL = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
    const FIREBASE_PRIVATE_KEY = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(
      /\\n/g,
      "\n"
    );

    app = initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY,
      }),
    });
  } else {
    app = getApps()[0]!;
  }

  auth = getAuth(app);
  return auth;
}

/**
 * Check if running in test mode
 */
function isTestMode(): boolean {
  return getEnv("NODE_ENV") === "test" || getEnv("BUN_ENV") === "test";
}

export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  if (isTestMode()) {
    throw new Error("Firebase verification not available in test mode");
  }
  return getFirebaseAuth().verifyIdToken(token);
}

export function isAnonymousUser(decodedToken: DecodedIdToken): boolean {
  return decodedToken.firebase?.sign_in_provider === "anonymous";
}
