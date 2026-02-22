# CLAUDE.md - whisperly_api

## Project Overview

`@sudobility/whisperly_api` is the backend API server for the Whisperly localization SaaS platform. Built with Hono on Bun, it provides REST endpoints for project management, dictionary/glossary management, translation services, analytics, entity/organization management, and subscription-based rate limiting.

**Platform**: Backend only (Bun runtime).

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
│   ├── index.ts                # PostgreSQL connection via Drizzle ORM
│   ├── schema.ts               # All table definitions (users, entities, projects, dictionary, etc.)
│   └── setup.ts                # Manual database setup script
├── lib/
│   └── env-helper.ts           # getEnv() reads .env.local → .env → process.env
├── middleware/
│   ├── firebaseAuth.ts         # Firebase JWT verification, sets c.get('userId'), c.get('siteAdmin')
│   └── rateLimit.ts            # Per-entity rate limiting via RevenueCat subscription tiers
├── routes/
│   ├── index.ts                # Route aggregation & mounting under /api/v1
│   ├── analytics.ts            # GET analytics by entity (date range, project filter)
│   ├── available-languages.ts  # GET available target languages (from config)
│   ├── dictionary.ts           # CRUD for dictionary terms (project-scoped)
│   ├── entities.ts             # Entity/org management, members, invitations
│   ├── invitations.ts          # User-facing invitation accept/decline
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
    ├── firebase.ts             # Firebase Admin SDK initialization
    └── translation.ts          # External translation service client with mock fallback
```

## Key Scripts

```bash
bun run dev          # Start dev server with watch mode
bun run start        # Start production server
bun run typecheck    # TypeScript type checking
bun run lint         # ESLint
bun run test:run     # Run tests once

# Database
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema to database
bun run db:studio    # Open Drizzle Studio
```

## API Routes

All routes under `/api/v1`. Admin routes require Firebase JWT authentication via `firebaseAuthMiddleware`.

### Public Routes (no auth, rate-limited by entity)
```
POST   /translate/:orgPath/:projectName         # Translation request (core feature)
GET    /translate/glossary/:orgPath/:projectName # Dictionary lookup callback for translation service
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
POST   /entities/:entitySlug/projects/:projectId/api-key    # Generate API key
DELETE /entities/:entitySlug/projects/:projectId/api-key    # Delete API key

# Dictionary (per project)
GET    /entities/:entitySlug/projects/:projectId/dictionary              # List all dictionary entries
POST   /entities/:entitySlug/projects/:projectId/dictionary              # Create entry
PUT    /entities/:entitySlug/projects/:projectId/dictionary/:dictionaryId # Update entry
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
GET    /entities/:entitySlug/members              # List members
POST   /entities/:entitySlug/invitations          # Create invitation (sends email)
PUT    /entities/:entitySlug/invitations/:invitationId  # Renew invitation (resends email)

# User Invitations
GET    /invitations                               # List pending invitations for user
POST   /invitations/:invitationId/accept          # Accept invitation
POST   /invitations/:invitationId/decline         # Decline invitation
```

**User-Specific:**
```
GET    /users/:userId/settings    # Get user settings
PUT    /users/:userId/settings    # Update settings
GET    /users/me                  # Get current user info (siteAdmin status)
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

### Entity Permission Checks

Routes use `@sudobility/entity_service` helpers for permission checking:

```typescript
const helpers = createEntityHelpers(config);
const entity = await helpers.entity.getEntityBySlug(entitySlug);
const canEdit = await helpers.permissions.canCreateProjects(entity.id, userId);
```

Permission model: owner (full access) > editor (create/edit) > viewer (read-only).

### Database Queries

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

1. **Dictionary Phase**: Load project dictionary cache → find terms in input → wrap with `{{brackets}}`
2. **Translation Service**: Call external service with bracketed strings
3. **Dictionary Replacement**: Replace `{{term}}` placeholders with language-specific dictionary translations
4. **Logging**: Record usage metrics (non-blocking)

### Dictionary Cache

- In-memory, lazy-loaded per project on first translation request
- Invalidated on dictionary create/update/delete mutations
- Whole-word matching, case-insensitive, longest-match-first

### Rate Limiting

- Per-entity (tied to RevenueCat subscription tier)
- Tiers: `none` (free), `whisperly`, `pro`, `enterprise` (unlimited)
- Site admins bypass rate limits
- `?testMode=true` query param switches to sandbox subscriptions

### Email Service

- Uses Resend for transactional invitation emails
- Non-blocking (`.catch()` logs errors, doesn't fail request)
- Gracefully disabled when `RESEND_API_KEY` not configured

## Environment Variables

```bash
# Required
DATABASE_URL=postgres://...           # PostgreSQL connection
FIREBASE_PROJECT_ID=...               # Firebase project
FIREBASE_CLIENT_EMAIL=...             # Firebase service account email
FIREBASE_PRIVATE_KEY=...              # Firebase private key
TRANSLATION_SERVICE_URL=...           # External translation service

# Optional
PORT=3000                             # Server port (default: 3000)
SITEADMIN_EMAILS=admin@example.com    # Comma-separated admin emails
TRANSLATION_SERVICE_TIMEOUT=120000    # Translation timeout ms (default: 120000)
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
5. Add tests

## Dependencies

- `hono` — web framework
- `drizzle-orm` + `postgres` — database ORM
- `firebase-admin` — JWT auth verification
- `zod` + `@hono/zod-validator` — request validation
- `resend` — transactional emails
- `@sudobility/whisperly_types` — shared types
- `@sudobility/auth_service` — Firebase user verification + admin check
- `@sudobility/entity_service` — entity/member/invitation management
- `@sudobility/ratelimit_service` — rate limit checking
- `@sudobility/subscription_service` — RevenueCat integration
