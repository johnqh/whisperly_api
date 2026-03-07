# @sudobility/whisperly_api

Backend API server for the Whisperly localization SaaS platform. Built with Hono on Bun with PostgreSQL, Firebase auth, and subscription-based rate limiting.

## Setup

```bash
bun install
cp .env.example .env   # Configure DATABASE_URL, Firebase, translation service
```

## Routes

### Public
| Route | Description |
|-------|-------------|
| `POST /api/v1/translate/:orgPath/:projectName` | Translation (rate-limited) |
| `GET /api/v1/available-languages` | Supported languages |

### Authenticated (Firebase JWT)
| Route | Description |
|-------|-------------|
| `/api/v1/entities/:entitySlug/projects` | Project CRUD + API key management |
| `/api/v1/entities/:entitySlug/projects/:projectId/dictionary` | Dictionary CRUD |
| `/api/v1/entities/:entitySlug/projects/:projectId/languages` | Project languages |
| `/api/v1/entities/:entitySlug/analytics` | Usage analytics |
| `/api/v1/entities/:entitySlug/members` | Team management |
| `/api/v1/entities/:entitySlug/invitations` | Invitation management |
| `/api/v1/ratelimits/:rateLimitUserId` | Rate limit status |

## Development

```bash
bun run dev          # Watch mode (port 3000)
bun run start        # Production start
bun run test:run     # Run tests once
bun run verify       # All checks
bun run db:studio    # Open Drizzle Studio
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATABASE_URL` | -- | PostgreSQL connection |
| `FIREBASE_*` | -- | Firebase Admin credentials (3 vars) |
| `TRANSLATION_SERVICE_URL` | -- | External translation service |
| `REVENUECAT_API_KEY` | -- | Subscription management (optional) |
| `RESEND_API_KEY` | -- | Invitation emails (optional) |

## Related Packages

- `whisperly_types` -- Shared type definitions
- `whisperly_client` -- API client SDK
- `whisperly_lib` -- Business logic library
- `whisperly_app` -- Web frontend

## License

BUSL-1.1
