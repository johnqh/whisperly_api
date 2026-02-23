# Improvement Plans - whisperly_api

## Priority 1: Code Quality & Maintainability

### 1.1 Extract shared `getEntityWithPermission` helper
**Files**: `src/routes/dictionary.ts`, `src/routes/project-languages.ts`, `src/routes/projects.ts`, `src/routes/analytics.ts`
**Issue**: The `getEntityWithPermission` helper function is duplicated across 3 route files with slight variations (e.g., `projects.ts` includes `errorCode`). Similarly, `verifyProjectOwnership` is duplicated in `dictionary.ts` and `project-languages.ts`.
**Suggestion**: Extract into a shared `src/lib/entity-helpers.ts` module with a unified signature that supports optional `errorCode` fields. This reduces maintenance burden and ensures consistent error handling.

### 1.2 Consolidate entity helpers config
**Files**: All route files in `src/routes/`
**Issue**: Every route file independently creates `createEntityHelpers(config)` with the same config object. While these are module-level singletons, the config construction is repeated.
**Suggestion**: Create a shared `src/lib/entity-config.ts` that exports a pre-configured `helpers` singleton. Routes would import directly instead of constructing their own.

### 1.3 Add `verify` script
**Issue**: No single command to run all checks (typecheck + lint + test).
**Suggestion**: Add `"verify": "bun run typecheck && bun run lint && bun run test:run"` to package.json scripts.

## Priority 2: Error Handling & Consistency

### 2.1 Standardize error response format
**Files**: `src/routes/entities.ts`, `src/routes/invitations.ts` vs other routes
**Issue**: Entity and invitation routes return `{ success: false, error: message }` directly, while other routes use `errorResponse()` from `@sudobility/whisperly_types`. This creates an inconsistent API surface.
**Suggestion**: Migrate entity and invitation routes to use `errorResponse()` consistently. Add `errorCode` fields where appropriate for client-side i18n.

### 2.2 Add structured error codes to all routes
**Files**: All routes
**Issue**: Only `projects.ts` consistently includes `errorCode` fields. Other routes return plain error messages, making client-side error handling inconsistent.
**Suggestion**: Define a centralized error code enum in `src/lib/error-codes.ts` and use it across all routes.

### 2.3 Improve global error handler
**File**: `src/index.ts`
**Issue**: The global error handler exposes full stack traces in development. Consider structured logging and consistent error formatting.
**Suggestion**: Add structured error logging (JSON format) for production. Consider adding request ID tracking for debugging.

## Priority 3: Database & Performance

### 3.1 Dictionary entry batch operations
**File**: `src/routes/dictionary.ts`
**Issue**: Dictionary create/update operations insert entries one-by-one in a loop (`for...of` with individual `await db.insert()`). This is N+1 queries.
**Suggestion**: Use batch insert with `db.insert(dictionaryEntry).values([...entries])` and conflict handling.

### 3.2 Add database connection pooling configuration
**File**: `src/db/index.ts`
**Issue**: The PostgreSQL connection uses default pooling settings. No explicit configuration for max connections, idle timeout, or connection reuse.
**Suggestion**: Add explicit pool configuration via `postgres()` options (e.g., `max`, `idle_timeout`, `connect_timeout`).

### 3.3 Dictionary cache TTL
**File**: `src/services/dictionaryCache.ts`
**Issue**: Dictionary cache is only invalidated by explicit mutations. If dictionary entries are modified directly in the database (e.g., via Drizzle Studio or migrations), the cache becomes stale.
**Suggestion**: Add a configurable TTL (e.g., 5 minutes) to force cache refresh periodically, in addition to mutation-based invalidation.

### 3.4 Non-blocking usage logging
**File**: `src/routes/translate.ts`
**Issue**: Usage record insertion (`await db.insert(usageRecords)`) blocks the translation response. While wrapped in try/catch, it still adds latency.
**Suggestion**: Use `void db.insert(usageRecords).values(...).catch(...)` pattern (fire-and-forget) to avoid blocking the response. Alternatively, batch usage records and flush periodically.

## Priority 4: Security

### 4.1 Add request body size limits
**Issue**: No explicit request body size limit configured on the Hono app.
**Suggestion**: Add Hono body limit middleware to prevent oversized payloads, especially on the translation endpoint.

### 4.2 Rate limit the translation endpoint more granularly
**File**: `src/routes/translate.ts`
**Issue**: Rate limiting is per-entity but doesn't account for request size (a request with 1000 strings counts the same as 1 string).
**Suggestion**: Consider character-count-based rate limiting in addition to request-count-based limits.

### 4.3 API key hashing
**File**: `src/routes/projects.ts`
**Issue**: API keys are stored in plaintext in the database (`api_key` column).
**Suggestion**: Store hashed API keys. Show the full key only once on generation. Compare incoming keys against the hash.

## Priority 5: Testing

### 5.1 Increase test coverage for routes
**Issue**: Test directory structure suggests existing tests but coverage of route handlers may be incomplete, especially for edge cases (permission boundaries, duplicate names, rate limit bypasses).
**Suggestion**: Add integration tests for critical flows: translation pipeline end-to-end, dictionary upsert behavior, entity permission boundaries, and rate limit enforcement.

### 5.2 Add test for dictionary cache behavior
**File**: `src/services/dictionaryCache.ts`
**Issue**: The dictionary cache has complex matching logic (longest match first, word boundary, case-insensitive) that benefits from comprehensive unit testing.
**Suggestion**: Add test cases for overlapping terms, multi-language detection, Unicode word boundaries, and cache invalidation race conditions.

## Priority 6: Observability

### 6.1 Add structured logging
**Issue**: Current logging uses `console.log` / `console.error` throughout. No structured format, request correlation, or log levels.
**Suggestion**: Consider a lightweight structured logger (e.g., `pino`) with request ID correlation and configurable log levels.

### 6.2 Add health check detail
**File**: `src/index.ts`
**Issue**: Health check returns static JSON. It doesn't verify database connectivity or service dependencies.
**Suggestion**: Add a `/health/detailed` endpoint that checks database connectivity and optionally translation service availability.

## Priority 7: Code Organization

### 7.1 Remove dead setup.ts duplication
**Files**: `src/db/index.ts` vs `src/db/setup.ts`
**Issue**: Database initialization logic exists in both files. `setup.ts` is a standalone script that duplicates much of `initDatabase()` in `index.ts`.
**Suggestion**: Refactor `setup.ts` to import and call `initDatabase()` instead of duplicating the SQL. This ensures schema changes only need to be made once.

### 7.2 Move configuration constants
**Issue**: Rate limit tier display names are defined in both `src/middleware/rateLimit.ts` (`entitlementDisplayNames`) and `src/routes/ratelimits.ts` (`TIER_DISPLAY_NAMES`).
**Suggestion**: Consolidate into `src/config/rateLimits.ts` alongside the rate limits config.
