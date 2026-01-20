// Mock for @sudobility/auth_service

import type { DecodedIdToken } from "firebase-admin/auth";

/**
 * Initialize auth - no-op in tests
 */
export function initializeAuth(_config: {
  firebase?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  siteAdminEmails?: string;
}) {
  // No-op in tests
}

/**
 * Create a cached verifier that returns mock tokens
 */
export function createCachedVerifier(_ttlMs: number) {
  return {
    verify: async (_token: string): Promise<DecodedIdToken> => {
      return {
        uid: "mock-uid",
        aud: "mock-aud",
        auth_time: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
        iss: "mock-iss",
        sub: "mock-sub",
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
      } as DecodedIdToken;
    },
  };
}

/**
 * Get user info from token
 */
export function getUserInfo(token: DecodedIdToken) {
  return {
    uid: token.uid,
    email: token.email || null,
  };
}

/**
 * Check if user is a site admin
 */
export function isSiteAdmin(_token: DecodedIdToken): boolean {
  return false;
}

/**
 * Check if user is anonymous
 */
export function isAnonymousUser(token: DecodedIdToken): boolean {
  return token?.firebase?.sign_in_provider === "anonymous";
}
