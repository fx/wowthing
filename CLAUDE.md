# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (pg-boss auto-starts, workers run in-process)
bun --bun run dev

# Run all tests
bun run test

# Run a single test file
bunx vitest run src/lib/blizzard/__tests__/client.test.ts

# Run tests matching a pattern
bunx vitest run -t "pattern"

# Watch mode
bun run test:watch

# DB migrations
bun run db:generate   # Generate migration files from schema changes
bun run db:migrate    # Apply migrations
bun run db:seed       # Seed activity definitions

# Build & start production
bun run build
bun .output/server/index.mjs

# Docker postgres (must be running for dev)
sudo docker compose up -d
```

## Upstream WoWThing References

This project is a reimplementation of WoWThing. Always consult these upstream repos for parity:

- **Addon** (Lua, in-game data collector): https://github.com/ThingEngineering/wowthing-collector
  - Character keys use Player GUID format: `Player-{realmId}-{hexCharId}`
  - The hex portion converts to the Blizzard API numeric character ID
  - Only the active (logged-in) character has a `name` field; all others have `name = nil`
  - Guild key format: `{regionNumber}/{realmName}/{guildName}` (1=US, 2=KR, 3=EU, 4=TW)
  - Currency string format: `qty:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty`

- **App** (C#/.NET backend + Vue frontend): https://github.com/ThingEngineering/wowthing-again
  - Character matching: regex extracts hex from Player GUID, converts to decimal blizzardId
  - Character metadata (name, class, race, realm) comes from Blizzard API, not the addon
  - Upload processing: `apps/backend/Jobs/User/UserUploadJob.cs`

## Architecture

**TanStack Start** SSR app (React 19 + Vite 7) tracking World of Warcraft weekly activities.

### Data Flow

1. User authenticates via **Better Auth** (Battle.net OAuth2)
2. On login, a database hook encrypts tokens (AES-256-GCM) and queues an initial sync job
3. **pg-boss** workers fetch data from Blizzard API and store in PostgreSQL via **Drizzle ORM**
4. Cron jobs (`schedule-syncs` every minute, `session-cleanup` daily) manage ongoing sync scheduling
5. Dashboard loads data via TanStack Router loaders calling server functions

### Key Layers

- **Routes** (`src/routes/`): File-based TanStack Router. `__root.tsx` is the layout wrapper.
- **Server Functions** (`src/server/functions/`): `createServerFn()` with `authMiddleware` providing `context.userId`. Must return serializable types.
- **pg-boss** (`src/server/plugins/pg-boss.ts`): Lazy-initialized via `getBossAsync()` (never `getBoss()`). Workers defined inline with typed job registry.
- **Auth** (`src/lib/auth/`): Better Auth with generic OAuth plugin for Battle.net. App tables bridge via `users.betterAuthUserId`.
- **DB Schema** (`src/db/schema.ts`): Better Auth tables (user, session, account, verification) + app tables (users, accounts, characters, weeklyActivities, questCompletions, currencies, renown, activityDefinitions, syncState).

### Patterns

- **Middleware redirects**: Use `throw redirect({ to: '/login' })` from `@tanstack/react-router`, NOT `throw new Response(302)`
- **@fx/ui**: Flat exports (`Card`, `CardHeader`, `Button`, `cn()`). No compound components (not `Card.Header`). Do not wrap `Button`.
- **Tailwind v4**: `@theme inline` requires static `hsl()` values, not `var()` references. `@source "../node_modules/@fx/ui"` in `global.css` for component scanning.
- **Encryption**: AES-256-GCM with `ENCRYPTION_KEY` (64 hex chars). Format: `iv:tag:encrypted`.

### Package Registry

`@fx/ui` is installed from GitHub Packages (`@fx:registry=https://npm.pkg.github.com` in `.npmrc`). CI authenticates via `GITHUB_TOKEN` written to `.npmrc`.

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_URL` - OAuth callback base URL
- `BETTER_AUTH_SECRET` - Session signing key
- `BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET` - OAuth credentials
- `ENCRYPTION_KEY` - 64 hex chars for AES-256-GCM
- `BATTLENET_DEFAULT_REGION` - Default region (e.g., `us`)

## Project Goals

- **Test coverage**: Target as close to 100% as possible. All new code must include tests. When modifying existing code, add tests for any uncovered paths.
- **WoWThing addon compatibility**: This app must remain compatible with the existing WoWThing addon data format. The addon upload parser (`src/lib/addon/`) and its Zod schemas define the contract with the in-game addon. Do not change the expected upload format without understanding the downstream impact on existing addon users.

## Code Style

Configured via `biome.json`: 2-space indents, single quotes, semicolons.
