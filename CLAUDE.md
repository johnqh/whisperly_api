# CLAUDE.md - whisperly_api

## Project Overview

`@sudobility/whisperly_api` (v1.0.51) is the backend API server for the Whisperly localization SaaS platform. Built with Hono on Bun, it provides REST endpoints for project management, dictionary/glossary management, translation services, analytics, entity/organization management, and subscription-based rate limiting.

**Platform**: Backend only (Bun runtime).
**License**: BUSL-1.1 (Business Source License)
**Database**: PostgreSQL via Drizzle ORM (schema: `whisperly`)
**Containerized**: Yes (Dockerfile with multi-platform support, `oven/bun:latest`)

## Package Manager

**Bun** (not npm/yarn): `bun install`, `bun run <script>`, `bun add <package>`

## Project Structure

```
src/
├── index.ts                    # Hono app setup, global error handler, health check, server start
├── config/
│   ├── languages.json          # Available languages config (16 languages with flags)
│   └── rateLimits.ts           # Rate limit tier definitions (none/whisperly/pro/enterprise)
├── db/
│   ├── index.ts                # PostgreSQL connection via Drizzle ORM (lazy-init proxy)
│   ├── schema.ts               # All table definitions (users, entities, projects, dictionary, etc.)
│   └── setup.ts                # Manual database setup script (run with: bun run src/db/setup.ts)
├── lib/
│   └── env-helper.ts           # getEnv() / getRequiredEnv() — reads .env.local → .env → process.env
├── middleware/
│   ├── firebaseAuth.ts         # Firebase JWT verification, sets c.get('userId'), c.get('siteAdmin')
│   └── rateLimit.ts            # Per-entity rate limiting via RevenueCat subscription tiers
├── routes/
│   ├── index.ts                # Route aggregation & mounting under /api/v1
│   ├── analytics.ts            # GET analytics by entity (date range, project filter)
│   ├── available-languages.ts  # GET available target languages (from config)
│   ├── dictionary.ts           # CRUD for dictionary terms (project-scoped)
│   ├── entities.ts             # Entity/org management, members, invitations
│   ├── invitations.ts          # User-facing invitation accept/decline (by token)
│   ├── project-languages.ts    # GET/POST project target languages
│   ├── projects.ts             # Project CRUD + API key management
│   ├── ratelimits.ts           # Rate limit config & usage history
│   ├── settings.ts             # User settings (legacy org paths)
│   ├── translate.ts            # Public translation endpoint (core feature)
│   └── users.ts                # User info (siteAdmin status)
├── schemas/
│   └── index.ts                # Zod validation schemas for all routes
└── services/
    ├── dictionaryCache.ts      # In-memory dictionary cache (lazy-loaded, invalidated on mutation)
    ├── email.ts                # Resend email service for invitation emails
    ├── firebase.ts             # Firebase Admin SDK initialization via auth_service
    └── translation.ts          # External translation service client with mock fallback

tests/
├── __mocks__/                  # Test mocks for ratelimit_service and auth_service
├── lib/                        # Library tests
├── middleware/                  # Middleware tests
├── schemas/                    # Schema validation tests
├── services/                   # Service tests
└── setup.ts                    # Test setup

scripts/
└── fix-personal-entity-roles.ts  # One-off migration script

drizzle/                         # Generated Drizzle migrations
drizzle.config.ts                # Drizzle Kit configuration
Dockerfile                       # Multi-platform Docker build (oven/bun:latest)
```

## Key Scripts

```bash
bun run dev          # Start dev server with watch mode (--watch)
bun run start        # Start production server
bun run typecheck    # TypeScript type checking (tsc --noEmit)
bun run lint         # ESLint (src directory)
bun run format       # Prettier format (src directory)
bun run format:check # Prettier check
bun run test         # Run tests in watch mode
bun run test:run     # Run tests once

# Database
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema to database
bun run db:studio    # Open Drizzle Studio
```

## TypeScript Configuration

- **Target**: ESNext
- **Module**: Preserve (bundler mode)
- **Strict mode**: Yes
- **noEmit**: Yes (Bun runs TypeScript directly)
- **noUncheckedIndexedAccess**: Off
- **noImplicitOverride**: On
- **Excludes**: `tests/**/*`, `scripts/**/*`

## Testing

- **Framework**: Vitest (node environment)
- **Test location**: `tests/` directory
- **Mocking strategy**: Vitest `resolve.alias` maps `@sudobility/ratelimit_service` and `@sudobility/auth_service` to test mocks
- **Run**: `bun run test:run`

## API Routes

All routes under `/api/v1`. Admin routes require Firebase JWT authentication via `firebaseAuthMiddleware`.

### Public Routes (no auth, rate-limited by entity)
```
POST   /translate/:orgPath/:projectName         # Translation request (core feature)
```

### Authenticated Routes (Firebase JWT)

**Entity-Centric:**
```
# Projects
GET    /entities/:entitySlug/projects              # List projects
POST   /entities/:entitySlug/projects              # Create project
GET    /entities/:entitySlug/projects/:projectId    # Get project
PUT    /entities/:entitySlug/projects/:projectId    # Update project
DELETE /entities/:entitySlug/projects/:projectId    # Delete project
POST   /entities/:entitySlug/projects/:projectId/api-key    # Generate API key (wh_<hex>)
DELETE /entities/:entitySlug/projects/:projectId/api-key    # Delete API key

# Dictionary (per project)
GET    /entities/:entitySlug/projects/:projectId/dictionary              # List all dictionary entries
POST   /entities/:entitySlug/projects/:projectId/dictionary              # Create entry (upsert)
PUT    /entities/:entitySlug/projects/:projectId/dictionary/:dictionaryId # Update entry (partial)
DELETE /entities/:entitySlug/projects/:projectId/dictionary/:dictionaryId # Delete entry
GET    /entities/:entitySlug/projects/:projectId/dictionary/search/:lang/:text  # Search

# Project Languages
GET    /entities/:entitySlug/projects/:projectId/languages   # Get project languages
POST   /entities/:entitySlug/projects/:projectId/languages   # Update project languages

# Analytics
GET    /entities/:entitySlug/analytics   # Usage analytics (with date range, project filter)

# Rate Limits
GET    /ratelimits/:rateLimitUserId              # Current rate limit status
GET    /ratelimits/:rateLimitUserId/history/:period  # Usage history (hour/day/month)
```

**Entity Management:**
```
GET    /entities                                  # List user's entities
POST   /entities                                  # Create organization
GET    /entities/:entitySlug                      # Get entity details
PUT    /entities/:entitySlug                      # Update entity
DELETE /entities/:entitySlug                      # Delete entity (organizations only)
GET    /entities/:entitySlug/members              # List members
PUT    /entities/:entitySlug/members/:memberId    # Update member role
DELETE /entities/:entitySlug/members/:memberId    # Remove member
GET    /entities/:entitySlug/invitations          # List pending invitations
POST   /entities/:entitySlug/invitations          # Create invitation (sends email)
PUT    /entities/:entitySlug/invitations/:invitationId  # Renew invitation (resends email)
DELETE /entities/:entitySlug/invitations/:invitationId  # Cancel invitation

# User Invitations (by token)
GET    /invitations                               # List pending invitations for user
POST   /invitations/:token/accept                 # Accept invitation
POST   /invitations/:token/decline                # Decline invitation
```

**User-Specific:**
```
GET    /users/:userId                # Get user info (siteAdmin status, self-only)
GET    /users/:userId/settings       # Get user settings
PUT    /users/:userId/settings       # Update settings
```

**Config:**
```
GET    /available-languages       # List all supported languages
```

## Key Patterns

### Authentication

```typescript
// Middleware sets context variables
c.set("firebaseUser", decodedToken);
c.set("userId", decodedToken.uid);
c.set("userEmail", decodedToken.email);
c.set("siteAdmin", isSiteAdmin(decodedToken.email));
```

- Anonymous users are explicitly rejected (403)
- User record is created/ensured in background (non-blocking)
- Token verification is cached (5-minute TTL) via `createCachedVerifier`

### Entity Permission Checks

Routes use `@sudobility/entity_service` helpers for permission checking:

```typescript
const helpers = createEntityHelpers(config);
const entity = await helpers.entity.getEntityBySlug(entitySlug);
const canEdit = await helpers.permissions.canCreateProjects(entity.id, userId);
```

Permission model: owner (full access) > editor (create/edit) > viewer (read-only).

### Database

- **Connection**: Lazy-initialized via Proxy pattern (no connection until first query)
- **Schema**: All tables in `whisperly` PostgreSQL schema
- **Tables**: users, user_settings, entities, entity_members, entity_invitations, projects, project_languages, dictionary, dictionary_entry, usage_records, rate_limit_counters
- **Initialization**: `initDatabase()` runs on startup -- creates schema, enums, tables, indexes, and runs entity migration

```typescript
import { db, projects } from "../db";
import { eq, and } from "drizzle-orm";

const results = await db.select().from(projects)
  .where(and(eq(projects.entity_id, entityId), eq(projects.is_active, true)));
```

### Error Responses

```typescript
import { errorResponse } from "@sudobility/whisperly_types";
return c.json({ ...errorResponse("Not found"), errorCode: "ENTITY_NOT_FOUND" }, 404);
```

Some routes include `errorCode` field for client-side i18n error lookup (e.g., `ENTITY_NOT_FOUND`, `ROLE_CANNOT_CREATE_PROJECTS`, `ACCESS_DENIED`).

### Validation

```typescript
import { zValidator } from "@hono/zod-validator";
app.post("/", zValidator("json", projectCreateSchema), async (c) => { ... });
```

### Translation Pipeline

1. **Dictionary Phase**: Load project dictionary cache -> find terms in input -> wrap with `{{brackets}}`
2. **Translation Service**: Call external service with bracketed strings
3. **Dictionary Replacement**: Replace `{{term}}` placeholders with language-specific dictionary translations
4. **Logging**: Record usage metrics to `usage_records` table (non-blocking)

Additional features:
- API key validation (if configured on project, supports Bearer token or `?api_key=` query)
- IP allowlist enforcement (if configured on project)
- Default target languages fallback from project configuration
- `?testMode=true` includes debug info (cache state, term matches, processed strings)
- `skip_dictionaries` option bypasses dictionary matching

### Dictionary Cache

- In-memory, lazy-loaded per project on first translation request
- Cache key: `"entityId:projectId"`
- Invalidated on dictionary create/update/delete mutations
- Whole-word matching, case-insensitive, longest-match-first
- All language entries for a dictionary are indexed (detection works in any language)

### Rate Limiting

- Per-entity (tied to RevenueCat subscription tier)
- Tiers: `none` (free: 10/h, 50/d, 200/m), `whisperly` (100/h, 1k/d, 10k/m), `pro` (500/h, 5k/d, 50k/m), `enterprise` (unlimited)
- Site admin entities bypass rate limits
- `?testMode=true` query param switches to sandbox subscriptions
- Gracefully disabled when `REVENUECAT_API_KEY` not configured
- All rate limit singletons are lazy-initialized to avoid env var requirements at import time

### Email Service

- Uses Resend for transactional invitation emails
- Non-blocking (`.catch()` logs errors, doesn't fail request)
- Gracefully disabled when `RESEND_API_KEY` not configured

### Docker Deployment

- Base image: `oven/bun:latest` (multi-platform)
- Runs as non-root user (`appuser:1001`)
- Health check: `curl http://localhost:8021/health` (30s interval)
- Process manager: `dumb-init`
- Requires `NPM_TOKEN` build arg for private `@sudobility` packages

## Environment Variables

```bash
# Required
DATABASE_URL=postgres://...           # PostgreSQL connection
FIREBASE_PROJECT_ID=...               # Firebase project
FIREBASE_CLIENT_EMAIL=...             # Firebase service account email
FIREBASE_PRIVATE_KEY=...              # Firebase private key

# Required for translation (mock fallback if unset)
TRANSLATION_SERVICE_URL=...           # External translation service endpoint

# Optional
PORT=3000                             # Server port (default: 3000)
NODE_ENV=production                   # Environment (affects error detail in responses)
SITEADMIN_EMAILS=admin@example.com    # Comma-separated admin emails
TRANSLATION_SERVICE_TIMEOUT=120000    # Translation timeout ms (default: 120000)
TRANSLATION_MOCK_FALLBACK=true        # Use mock translations when service unreachable
REVENUECAT_API_KEY=                   # RevenueCat for subscriptions (empty = free tier for all)
RESEND_API_KEY=                       # Resend for emails (empty = disabled)
RESEND_SENDER_EMAIL=                  # Sender email (default: onboarding@resend.dev)
RESEND_SENDER_NAME=                   # Sender name (default: Whisperly)
APP_URL=                              # App URL for email links (default: http://localhost:5173)
```

## Adding New Routes

1. Create route file in `src/routes/`
2. Define Zod schemas in `src/schemas/index.ts`
3. Mount route in `src/routes/index.ts`
4. For entity-scoped routes, use `firebaseAuthMiddleware` + entity permission helpers
5. Add tests in `tests/` (matching directory structure)
6. Use `successResponse()` / `errorResponse()` from `@sudobility/whisperly_types`

## Gotchas

- **Entity helpers duplication**: Each route file creates its own `helpers = createEntityHelpers(config)` instance with the same config. This is intentional (module-level singletons per route).
- **`getEntityWithPermission` helper**: Duplicated across `dictionary.ts`, `project-languages.ts`, and `projects.ts` with slight variations (e.g., projects.ts includes `errorCode`).
- **DB proxy pattern**: The `db` export uses a Proxy for lazy initialization. Calling `db` before `initDatabase()` will create the connection on first access but won't run migrations.
- **Entity factory tables**: Entity tables (`entities`, `entityMembers`, `entityInvitations`) are created via factory functions from `@sudobility/entity_service`. Some routes require explicit column selection because bare `.select()` doesn't work with factory-created Drizzle tables.
- **Test mocking**: Auth and rate limit services are fully mocked via Vitest alias resolution, not `vi.mock()`. Tests use different module paths than source code.
- **`rateLimitUserId` is entity slug**: Despite the name, the `:rateLimitUserId` path parameter in rate limit routes is actually the entity slug.

## Dependencies

### Runtime
- `hono` (^4.10.7) -- web framework
- `drizzle-orm` (^0.45.0) + `postgres` (^3.4.7) -- database ORM + driver
- `firebase-admin` (^13.6.0) -- JWT auth verification
- `zod` (^3.24.0) + `@hono/zod-validator` (^0.7.5) -- request validation
- `resend` (^6.9.2) -- transactional emails
- `@sudobility/whisperly_types` (^1.0.23) -- shared types
- `@sudobility/types` (^1.9.53) -- shared platform types
- `@sudobility/auth_service` (^1.1.7) -- Firebase user verification + admin check
- `@sudobility/entity_service` (^1.0.23) -- entity/member/invitation management
- `@sudobility/ratelimit_service` (^1.0.24) -- rate limit checking
- `@sudobility/subscription_service` (^1.0.5) -- RevenueCat integration

### Dev
- `typescript` (^5.9.3), `vitest` (^4.0.16), `drizzle-kit` (^0.31.8)
- `eslint` (^9.39.2), `prettier` (^3.7.4)
