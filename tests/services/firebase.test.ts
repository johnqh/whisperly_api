import { describe, test, expect } from "bun:test";
import { isAnonymousUser } from "../../src/services/firebase";
import type { DecodedIdToken } from "firebase-admin/auth";

describe("firebase service", () => {
  describe("isAnonymousUser", () => {
    test("returns true for anonymous sign-in provider", () => {
      const token = {
        uid: "test-uid",
        firebase: {
          sign_in_provider: "anonymous",
          identities: {},
        },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(true);
    });

    test("returns false for email sign-in provider", () => {
      const token = {
        uid: "test-uid",
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });

    test("returns false for google sign-in provider", () => {
      const token = {
        uid: "test-uid",
        firebase: {
          sign_in_provider: "google.com",
          identities: {},
        },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });

    test("returns false for custom token provider", () => {
      const token = {
        uid: "test-uid",
        firebase: {
          sign_in_provider: "custom",
          identities: {},
        },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });

    test("returns false when firebase property is missing", () => {
      const token = {
        uid: "test-uid",
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });

    test("returns false when sign_in_provider is undefined", () => {
      const token = {
        uid: "test-uid",
        firebase: {
          identities: {},
        },
      } as unknown as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });
  });
});
