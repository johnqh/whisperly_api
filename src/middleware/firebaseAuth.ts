import type { Context, Next } from "hono";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyIdToken, isAnonymousUser } from "../services/firebase";
import { errorResponse } from "@sudobility/whisperly_types";

declare module "hono" {
  interface ContextVariableMap {
    firebaseUser: DecodedIdToken;
  }
}

export async function firebaseAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json(errorResponse("Authorization header required"), 401);
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return c.json(
      errorResponse("Invalid authorization format. Use: Bearer <token>"),
      401
    );
  }

  try {
    const decodedToken = await verifyIdToken(token);

    if (isAnonymousUser(decodedToken)) {
      return c.json(
        errorResponse("Anonymous users cannot access this resource"),
        403
      );
    }

    c.set("firebaseUser", decodedToken);
    await next();
  } catch {
    return c.json(errorResponse("Invalid or expired Firebase token"), 401);
  }
}
