import { readFileSync } from "fs";
import { join } from "path";

// Cache for parsed .env.local file
let envLocalCache: Record<string, string> | null = null;

/**
 * Parse .env.local file and cache the result
 */
function parseEnvLocal(): Record<string, string> {
  if (envLocalCache !== null) {
    return envLocalCache;
  }

  envLocalCache = {};

  try {
    const envLocalPath = join(process.cwd(), ".env.local");
    const envLocalContent = readFileSync(envLocalPath, "utf8");

    const lines = envLocalContent.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const equalIndex = trimmedLine.indexOf("=");
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, equalIndex).trim();
      const value = trimmedLine.slice(equalIndex + 1).trim();

      // Remove quotes if present
      const unquotedValue = value.replace(/^["']|["']$/g, "");
      envLocalCache[key] = unquotedValue;
    }
  } catch {
    // .env.local file doesn't exist - use process.env values
  }

  return envLocalCache;
}

/**
 * Get environment variable with .env.local priority
 *
 * Priority order:
 * 1. .env.local file values (highest priority)
 * 2. process.env (from .env or system)
 * 3. defaultValue (if provided)
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  const envLocal = parseEnvLocal();
  if (envLocal[key] !== undefined && envLocal[key] !== "") {
    return envLocal[key];
  }

  if (process.env[key] !== undefined && process.env[key] !== "") {
    return process.env[key];
  }

  return defaultValue;
}

/**
 * Get required environment variable with .env.local fallback
 * Throws an error if the variable is not found
 */
export function getRequiredEnv(key: string): string {
  const value = getEnv(key);

  if (value === undefined || value === "") {
    throw new Error(`Required environment variable ${key} is not set`);
  }

  return value;
}
