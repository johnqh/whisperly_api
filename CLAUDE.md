# CLAUDE.md - whisperly_api

## Project Overview
`@sudobility/whisperly_api` is the backend API server for the Whisperly localization platform. It provides REST endpoints for project management, glossary management, translation services, analytics, and subscription handling.

## Tech Stack
- **Runtime**: Bun
- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Firebase Admin SDK
- **Validation**: Zod
- **Rate Limiting**: @sudobility/ratelimit_service
- **Testing**: Bun test runner

## Package Manager
**IMPORTANT**: This project uses **Bun**, not npm or yarn.
- Install dependencies: `bun install`
- Run scripts: `bun run <script>`
- Add dependencies: `bun add <package>` or `bun add -d <package>` for dev

## Project Structure
```
src/
├── index.ts              # App entry point, server setup
├── db/
│   ├── index.ts          # Database connection (Drizzle)
│   └── schema.ts         # Drizzle ORM schema definitions
├── lib/
│   └── env-helper.ts     # Environment variable utilities
├── middleware/
│   ├── firebaseAuth.ts   # Firebase JWT authentication
│   └── rateLimit.ts      # Rate limiting middleware
├── routes/
│   ├── index.ts          # Route aggregation
│   ├── analytics.ts      # GET /analytics
│   ├── entities.ts       # Entity/org management
│   ├── glossaries.ts     # Glossary CRUD
│   ├── invitations.ts    # User invitations
│   ├── projects.ts       # Project CRUD
│   ├── ratelimits.ts     # Rate limit config
│   ├── settings.ts       # User settings
│   ├── subscription.ts   # Subscription status
│   └── translate.ts      # Translation endpoint
├── schemas/
│   └── index.ts          # Zod validation schemas
└── services/
    ├── firebase.ts       # Firebase auth service
    └── translation.ts    # External translation service
tests/
├── setup.ts              # Test environment setup
├── lib/                  # Unit tests for lib/
├── middleware/           # Middleware tests
├── schemas/              # Schema validation tests
└── services/             # Service tests
```

## Key Scripts
```bash
bun run dev          # Start dev server with watch mode
bun run start        # Start production server
bun run test         # Run all tests
bun run typecheck    # Run TypeScript type checking
bun run lint         # Run ESLint

# Database commands
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema to database
bun run db:studio    # Open Drizzle Studio
```

## API Routes Overview

### Authenticated Routes (Firebase JWT required)
- `GET/POST/PUT/DELETE /api/v1/users/:userId/projects` - Project CRUD
- `GET/POST/PUT/DELETE /api/v1/users/:userId/projects/:projectId/glossaries` - Glossary CRUD
- `GET/PUT /api/v1/users/:userId/settings` - User settings
- `GET /api/v1/users/:userId/analytics` - Usage analytics
- `GET /api/v1/users/:userId/subscription` - Subscription status
- `GET /api/v1/ratelimits` - Rate limit configurations
- `GET/POST/PUT/DELETE /api/v1/entities` - Organization management

### Public Routes (rate-limited by org)
- `POST /api/v1/translate/:orgPath/:projectName` - Translation requests
- `GET /api/v1/translate/glossary/:orgPath/:projectName` - Glossary lookup callback

## Environment Variables
Required environment variables (see `.env.example`):
```
DATABASE_URL=postgresql://...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
TRANSLATION_SERVICE_URL=...
API_BASE_URL=...
REVENUECAT_API_KEY=...
```

## Development Guidelines

### Adding New Routes
1. Create route file in `src/routes/`
2. Define Zod schemas in `src/schemas/index.ts`
3. Add route to `src/routes/index.ts`
4. Add corresponding tests in `tests/`

### Authentication Pattern
```typescript
import { firebaseAuthMiddleware } from '../middleware/firebaseAuth';

app.use('/protected/*', firebaseAuthMiddleware);
app.get('/protected/resource', (c) => {
  const user = c.get('firebaseUser'); // DecodedIdToken
  // ...
});
```

### Database Pattern
```typescript
import { db, projects } from '../db';
import { eq } from 'drizzle-orm';

const results = await db.select().from(projects).where(eq(projects.user_id, userId));
```

### Error Handling
Use `errorResponse()` from whisperly_types:
```typescript
import { errorResponse } from '@sudobility/whisperly_types';
return c.json(errorResponse('Error message'), 400);
```

## Testing
Tests use Bun's built-in test runner. Test environment is configured in `tests/setup.ts`.

```bash
bun test                    # Run all tests
bun test tests/schemas      # Run specific directory
```

## Dependencies
- `@sudobility/whisperly_types` - Shared types
- `@sudobility/ratelimit_service` - Rate limiting
- `hono` - Web framework
- `drizzle-orm` - Database ORM
- `firebase-admin` - Authentication
- `zod` - Validation
