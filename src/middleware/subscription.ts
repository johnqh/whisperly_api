import type { Context } from "hono";
import { SubscriptionHelper } from "@sudobility/subscription_service";
import { getEnv } from "../lib/env-helper";

let _subscriptionHelper: SubscriptionHelper | null = null;

export function getSubscriptionHelper(): SubscriptionHelper | null {
  const apiKey = getEnv("REVENUECAT_API_KEY");
  if (!apiKey) return null;
  if (!_subscriptionHelper) {
    _subscriptionHelper = new SubscriptionHelper({ revenueCatApiKey: apiKey });
  }
  return _subscriptionHelper;
}

export function getTestMode(c: Context): boolean {
  const url = new URL(c.req.url);
  return url.searchParams.get("testMode") === "true";
}
