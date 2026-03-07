# Backend: Foundation, Auth, Data Pipeline

## Overview

Stand up the complete backend for the WoWThing Midnight Activity Tracker: TanStack Start project scaffolding with Drizzle ORM and pg-boss, Battle.net OAuth2 authentication via Better Auth, the Blizzard API sync pipeline, the WoWThing addon upload/parse/process pipeline, all server functions, and Docker Compose for local development. After this spec, every API endpoint and background job is functional — the frontend spec (0002) only needs to consume the data.

## Background

This is spec 1 of 2 for the WoWThing reimagined project described in [docs/poc.md](../poc.md). It covers poc.md sections 4-9 and 11-14 — everything server-side.

WoWThing's backend is 5 .NET services with 40+ job types, 90+ DB tables, Redis, and custom job infrastructure. We replace all of it with a single TanStack Start app, ~15 Drizzle tables, pg-boss for background jobs, and PostgreSQL as the sole infrastructure dependency.

Related specs:
- [0002-frontend](./0002-frontend.md) — Dashboard UI, components, responsive layout (depends on this)

## Goals

- TanStack Start project scaffolding (Vinxi, file-based routing, server functions)
- Complete Drizzle ORM schema with all tables, indexes, JSONB types
- pg-boss Nitro plugin with type-safe job registry and all workers
- Better Auth with Battle.net OAuth2 custom provider
- Blizzard API client with Zod validation, 304 support, token refresh
- Background sync workers: user profile, character profile, quests, reputations
- Scheduler (pg-boss cron) with adaptive sync intervals and rate limiting
- Lua SavedVariables parser (TypeScript port of `LuaToJsonConverter4`)
- Addon upload server function with Zod validation
- Addon processing job: currencies, quests, lockouts, vault, keystone -> DB
- Activity definition seed system (YAML -> database)
- Reset time utilities (daily/weekly per region)
- Docker Compose (app + postgres)
- All server functions: `getDashboardData`, `uploadAddonData`, `triggerSync`
- Environment variable configuration and encrypted token storage

## Non-Goals

- Frontend components and pages (spec 0002)
- Production deployment infrastructure (Fly.io, Railway)
- Real-time push (SSE, WebSockets) — TanStack Query polling is sufficient
- Admin interface
- API documentation / OpenAPI spec

## Design

### 1. Project Scaffolding

#### Package Setup

Initialize with Bun. @fx/ui is installed from GitHub Packages.

```json
{
  "name": "wowthing",
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "node .output/server/index.mjs",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "bun run src/db/seed.ts"
  },
  "dependencies": {
    "@fx/ui": "0.0.0-28fe5ad",
    "@tanstack/react-query": "^5",
    "@tanstack/react-router": "^1",
    "@tanstack/react-start": "^1",
    "better-auth": "^1",
    "drizzle-orm": "^0.39",
    "pg-boss": "^10",
    "postgres": "^3",
    "tailwindcss": "^4",
    "zod": "^3",
    "yaml": "^2",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "drizzle-kit": "^0.30",
    "typescript": "^5.7",
    "vinxi": "^0.5"
  }
}
```

**`.npmrc`** for GitHub Packages:
```
@fx:registry=https://npm.pkg.github.com
```

#### TanStack Start Config

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/react-start/config';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: [tsConfigPaths()],
  },
});
```

#### Project Structure

```
wowthing/
├── src/
│   ├── routes/
│   │   ├── __root.tsx               # Root layout shell
│   │   ├── index.tsx                # Dashboard (loader + page)
│   │   ├── login.tsx                # Login page
│   │   ├── upload.tsx               # Addon upload page
│   │   └── api/
│   │       └── auth/
│   │           └── $.ts             # Better Auth catch-all handler
│   ├── components/                  # (spec 0002)
│   │   └── ui/                      # @fx/ui re-exports + custom components
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema (all tables)
│   │   ├── types.ts                 # JSONB types (VaultSlot, Lockout)
│   │   ├── index.ts                 # Database connection
│   │   └── seed.ts                  # Activity definition seeder
│   ├── lib/
│   │   ├── addon/
│   │   │   ├── lua-parser.ts       # Lua -> JSON converter (port of LuaToJsonConverter4)
│   │   │   ├── schema.ts           # Zod schemas for addon upload format
│   │   │   └── processor.ts        # Process parsed addon data into DB
│   │   ├── blizzard/
│   │   │   ├── client.ts           # API client with 304 + Zod validation
│   │   │   ├── schemas.ts          # Zod schemas for API responses
│   │   │   ├── sync.ts             # Character sync workers
│   │   │   ├── sync-profile.ts     # User profile sync (character roster)
│   │   │   └── scheduler.ts        # Cron scheduler for sync jobs
│   │   ├── auth/
│   │   │   ├── index.ts            # Better Auth config
│   │   │   ├── encryption.ts       # AES-256-GCM token encryption
│   │   │   └── middleware.ts        # Auth middleware for server functions
│   │   ├── activities/
│   │   │   └── resets.ts           # Reset time calculations (daily/weekly per region)
│   │   └── wow/
│   │       ├── classes.ts           # Class ID -> name/color mapping
│   │       └── constants.ts         # Game constants
│   ├── server/
│   │   ├── functions/
│   │   │   ├── activities.ts        # getDashboardData()
│   │   │   ├── sync.ts             # triggerSync()
│   │   │   └── upload.ts           # uploadAddonData()
│   │   └── plugins/
│   │       └── pg-boss.ts           # Nitro plugin: pg-boss lifecycle + all workers
│   ├── hooks/                       # (spec 0002)
│   ├── router.tsx
│   ├── entry-client.tsx
│   ├── entry-server.tsx
│   └── global.css
├── drizzle/
│   └── migrations/
├── seeds/
│   └── activities.yaml              # Midnight S1 activity definitions
├── app.config.ts
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
├── biome.json
├── tsconfig.json
├── .npmrc
└── package.json
```

### 2. Database Schema (Drizzle ORM)

All tables from poc.md section 6. Drizzle Kit is configured to ignore the `pgboss` schema.

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ['public'], // ignore pgboss schema
});
```

#### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | `battle_net_id`, `battle_tag`, `access_token` (encrypted), `refresh_token` (encrypted), `region` |
| `accounts` | WoW accounts (user has 1+) | `user_id` FK, `battle_net_account_id`, `region` |
| `characters` | WoW characters | `account_id` FK, `blizzard_id`, `name`, `realm_slug`, `class_id`, `level`, `item_level` |
| `weekly_activities` | Per-character weekly snapshot | `character_id` FK, `reset_week`, vault JSONB, keystone, lockouts JSONB |
| `quest_completions` | Quest completion log | `character_id` FK, `quest_id`, `reset_type`, `reset_week`/`reset_date` |
| `currencies` | Currency balances | `character_id` FK, `currency_id`, `quantity`, `week_quantity`, `week_max` |
| `renown` | Account-wide faction renown | `user_id` FK, `faction_id`, `renown_level` |
| `activity_definitions` | Seeded activity configs | `key` (unique), `quest_ids[]`, `threshold`, `metadata` JSONB |
| `sessions` | Auth sessions | `id` (token), `user_id` FK, `expires_at` |
| `sync_state` | API sync bookkeeping | `character_id` FK, `sync_type`, `last_modified_header`, `next_sync_after`, `error_count` |

Full Drizzle schema definition:

```typescript
// src/db/schema.ts
import {
  pgTable, text, integer, boolean, timestamp, jsonb,
  serial, uniqueIndex, index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// === Users ===
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  battleNetId: integer('battle_net_id').notNull().unique(),
  battleTag: text('battle_tag').notNull(),
  accessToken: text('access_token').notNull(),      // AES-256-GCM encrypted
  refreshToken: text('refresh_token'),                // AES-256-GCM encrypted
  tokenExpiresAt: timestamp('token_expires_at').notNull(),
  region: text('region').notNull(),                   // 'us' | 'eu' | 'kr' | 'tw'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// === Accounts ===
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  battleNetAccountId: integer('battle_net_account_id').notNull(),
  region: text('region').notNull(),
  displayName: text('display_name'),
});

// === Characters ===
export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  blizzardId: integer('blizzard_id').notNull(),
  name: text('name').notNull(),
  realmSlug: text('realm_slug').notNull(),
  classId: integer('class_id').notNull(),
  raceId: integer('race_id').notNull(),
  faction: text('faction').notNull(),                  // 'alliance' | 'horde'
  level: integer('level').notNull(),
  itemLevel: integer('item_level'),
  lastApiSyncAt: timestamp('last_api_sync_at'),
  lastApiModified: text('last_api_modified'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_characters_account').on(t.accountId),
]);

// === Weekly Activity Snapshots ===
export const weeklyActivities = pgTable('weekly_activities', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  resetWeek: text('reset_week').notNull(),            // "2026-W10"
  vaultDungeonProgress: jsonb('vault_dungeon_progress'), // VaultSlot[]
  vaultRaidProgress: jsonb('vault_raid_progress'),
  vaultWorldProgress: jsonb('vault_world_progress'),
  vaultHasRewards: boolean('vault_has_rewards').default(false),
  keystoneDungeonId: integer('keystone_dungeon_id'),
  keystoneLevel: integer('keystone_level'),
  lockouts: jsonb('lockouts'),                           // Lockout[]
  syncedAt: timestamp('synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_weekly_char_week').on(t.characterId, t.resetWeek),
]);

// === Quest Completions ===
export const questCompletions = pgTable('quest_completions', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  questId: integer('quest_id').notNull(),
  resetType: text('reset_type').notNull(),             // 'daily' | 'weekly'
  resetWeek: text('reset_week'),
  resetDate: text('reset_date'),                       // YYYY-MM-DD
  completedAt: timestamp('completed_at').defaultNow().notNull(),
}, (t) => [
  index('idx_quests_char_quest_week').on(t.characterId, t.questId, t.resetWeek),
  index('idx_quests_char_quest_date').on(t.characterId, t.questId, t.resetDate),
]);

// === Currencies ===
export const currencies = pgTable('currencies', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  currencyId: integer('currency_id').notNull(),
  quantity: integer('quantity').notNull().default(0),
  maxQuantity: integer('max_quantity'),
  weekQuantity: integer('week_quantity'),
  weekMax: integer('week_max'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_currencies_char_currency').on(t.characterId, t.currencyId),
]);

// === Renown (account-wide) ===
export const renown = pgTable('renown', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  factionId: integer('faction_id').notNull(),
  renownLevel: integer('renown_level').notNull().default(0),
  reputationCurrent: integer('reputation_current').notNull().default(0),
  reputationMax: integer('reputation_max').notNull().default(2500),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_renown_user_faction').on(t.userId, t.factionId),
]);

// === Activity Definitions (seeded) ===
export const activityDefinitions = pgTable('activity_definitions', {
  id: serial('id').primaryKey(),
  expansionId: integer('expansion_id').notNull(),      // 11 = Midnight
  patch: text('patch').notNull(),                      // "12.0.0"
  category: text('category').notNull(),                // 'weekly' | 'daily'
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  description: text('description'),
  resetType: text('reset_type').notNull(),             // 'daily' | 'weekly' | 'biweekly'
  questIds: integer('quest_ids').array(),
  threshold: integer('threshold'),
  accountWide: boolean('account_wide').default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: boolean('enabled').default(true),
  metadata: jsonb('metadata'),
}, (t) => [
  index('idx_activity_defs_expansion').on(t.expansionId, t.category),
]);

// === Sessions ===
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_sessions_user').on(t.userId),
  index('idx_sessions_expires').on(t.expiresAt),
]);

// === Sync State ===
export const syncState = pgTable('sync_state', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  syncType: text('sync_type').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  lastModifiedHeader: text('last_modified_header'),
  nextSyncAfter: timestamp('next_sync_after'),
  errorCount: integer('error_count').default(0),
}, (t) => [
  uniqueIndex('idx_sync_char_type').on(t.characterId, t.syncType),
  index('idx_sync_next').on(t.nextSyncAfter),
]);

// === Relations (for Drizzle relational query builder) ===
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  renown: many(renown),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  characters: many(characters),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(accounts, { fields: [characters.accountId], references: [accounts.id] }),
  weeklyActivities: many(weeklyActivities),
  questCompletions: many(questCompletions),
  currencies: many(currencies),
}));

export const weeklyActivitiesRelations = relations(weeklyActivities, ({ one }) => ({
  character: one(characters, { fields: [weeklyActivities.characterId], references: [characters.id] }),
}));

export const questCompletionsRelations = relations(questCompletions, ({ one }) => ({
  character: one(characters, { fields: [questCompletions.characterId], references: [characters.id] }),
}));

export const currenciesRelations = relations(currencies, ({ one }) => ({
  character: one(characters, { fields: [currencies.characterId], references: [characters.id] }),
}));
```

#### JSONB Types

```typescript
// src/db/types.ts
export type VaultSlot = {
  level: number;
  progress: number;
  threshold: number;
  itemLevel: number;
  upgradeItemLevel?: number;
};

export type Lockout = {
  instanceId: number;
  instanceName: string;
  difficulty: 'lfr' | 'normal' | 'heroic' | 'mythic';
  bossesKilled: number;
  bossCount: number;
};
```

#### Database Connection

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### 3. Authentication (Better Auth + Battle.net)

#### Better Auth Configuration

Better Auth with a custom Battle.net OAuth2 provider. It manages its own `user`/`session`/`account` tables via the Drizzle adapter. We extend the user model with `battleNetId` and `region`.

```typescript
// src/lib/auth/index.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/db';

export const auth = betterAuth({
  database: drizzleAdapter(db),
  socialProviders: {
    battlenet: {
      clientId: process.env.BATTLENET_CLIENT_ID!,
      clientSecret: process.env.BATTLENET_CLIENT_SECRET!,
      authorization: {
        url: 'https://oauth.battle.net/authorize',
        params: { scope: 'wow.profile' },
      },
      token: { url: 'https://oauth.battle.net/token' },
      userinfo: { url: 'https://oauth.battle.net/userinfo' },
      profile(profile: { id: number; battletag: string }) {
        return {
          id: String(profile.id),
          name: profile.battletag,
          battleNetId: profile.id,
        };
      },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  },
});
```

**Note:** Better Auth creates its own auth tables. Our `users`/`sessions` tables from the Drizzle schema above will need reconciliation — either let Better Auth own the auth lifecycle (recommended for speed) and link domain tables to Better Auth's user ID, or configure Better Auth to use our schema via its adapter customization.

#### Auth API Route

```typescript
// src/routes/api/auth/$.ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { auth } from '~/lib/auth';

export const APIRoute = createAPIFileRoute('/api/auth/$')({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});
```

#### Token Encryption

```typescript
// src/lib/auth/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}
```

#### Auth Middleware

```typescript
// src/lib/auth/middleware.ts
import { createMiddleware } from '@tanstack/react-start';
import { auth } from './index';

export const authMiddleware = createMiddleware({ type: 'function' })
  .handler(async ({ next, context }) => {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });
    if (!session) {
      throw new Response(null, { status: 302, headers: { Location: '/login' } });
    }
    return next({
      context: { session, userId: session.user.id, region: session.user.region ?? 'us' },
    });
  });
```

#### Post-Login Hook: Initial Character Sync

After first login, enqueue a job to fetch the user's character roster from the Blizzard API.

### 4. Blizzard API Client + Sync Pipeline

#### API Client

Type-safe client with Zod validation, 304 Not Modified support, and token expiry detection.

```typescript
// src/lib/blizzard/client.ts
import { z } from 'zod';

const API_HOSTS = {
  us: 'https://us.api.blizzard.com',
  eu: 'https://eu.api.blizzard.com',
  kr: 'https://kr.api.blizzard.com',
  tw: 'https://tw.api.blizzard.com',
} as const;

type Region = keyof typeof API_HOSTS;

export class BlizzardClient {
  constructor(private accessToken: string, private region: Region) {}

  async fetch<T>(
    path: string,
    schema: z.ZodType<T>,
    ifModifiedSince?: string,
  ): Promise<{ data: T | null; lastModified: string | null; notModified: boolean }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (ifModifiedSince) headers['If-Modified-Since'] = ifModifiedSince;

    const res = await fetch(`${API_HOSTS[this.region]}${path}`, { headers });

    if (res.status === 304) return { data: null, lastModified: ifModifiedSince!, notModified: true };
    if (res.status === 401) throw new TokenExpiredError();
    if (!res.ok) throw new BlizzardApiError(res.status, await res.text());

    return {
      data: schema.parse(await res.json()),
      lastModified: res.headers.get('Last-Modified'),
      notModified: false,
    };
  }
}

export class BlizzardApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Blizzard API ${status}: ${body}`);
  }
}
export class TokenExpiredError extends Error {
  constructor() { super('Access token expired'); }
}
```

#### Zod Schemas for API Responses

```typescript
// src/lib/blizzard/schemas.ts
import { z } from 'zod';

export const userProfileSchema = z.object({
  wow_accounts: z.array(z.object({
    id: z.number(),
    characters: z.array(z.object({
      id: z.number(),
      name: z.string(),
      realm: z.object({ slug: z.string() }),
      playable_class: z.object({ id: z.number() }),
      playable_race: z.object({ id: z.number() }),
      faction: z.object({ type: z.string() }),
      level: z.number(),
    })),
  })),
});

export const characterProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  equipped_item_level: z.number().optional(),
  character_class: z.object({ id: z.number() }),
  race: z.object({ id: z.number() }),
  faction: z.object({ type: z.string() }),
});

export const completedQuestsSchema = z.object({
  quests: z.array(z.object({ id: z.number() })),
});

export const reputationsSchema = z.object({
  reputations: z.array(z.object({
    faction: z.object({ id: z.number(), name: z.string() }),
    standing: z.object({
      raw: z.number(), value: z.number(), max: z.number(),
      tier: z.number(), name: z.string(),
    }),
  })),
});
```

#### Sync Workers

```typescript
// src/lib/blizzard/sync.ts
// syncCharacterProfile: fetch /profile/wow/character/{realm}/{name}, upsert characters row
// syncCharacterQuests: fetch /quests/completed, insert quest_completions for current reset week
// syncCharacterReputations: fetch /reputations, upsert renown for Midnight factions

// Each worker:
// 1. Gets the character's owner's decrypted access token
// 2. Checks sync_state for If-Modified-Since header
// 3. Calls BlizzardClient.fetch with Zod schema
// 4. On success: upsert data, update sync_state (next_sync_after, last_modified, reset error_count)
// 5. On 304: update sync_state.last_synced_at only
// 6. On 401: attempt token refresh, throw to trigger pg-boss retry
// 7. On other error: increment error_count, extend next_sync_after with backoff
```

#### User Profile Sync

Fetches `/profile/user/wow` to discover character roster. Runs on first login and every 6 hours.

```typescript
// src/lib/blizzard/sync-profile.ts
export async function syncUserProfile(userId: string, accessToken: string, region: string) {
  // 1. Fetch user profile (all WoW accounts + characters)
  // 2. Upsert accounts table
  // 3. Upsert characters table (blizzardId as natural key)
  // 4. Initialize sync_state rows for each character's sync types
}
```

#### Scheduler

Runs every minute via pg-boss cron. Queries `sync_state` for characters due for sync.

```typescript
// src/lib/blizzard/scheduler.ts
export async function scheduleCharacterSyncs(boss: PgBoss) {
  // SELECT from sync_state JOIN characters
  // WHERE next_sync_after < NOW()
  // ORDER BY last_synced_at ASC
  // LIMIT 20
  //
  // For each: boss.send(`sync-character-${syncType}`, { characterId, region }, {
  //   singletonKey: `${characterId}-${syncType}`,
  //   retryLimit: 3, retryDelay: 60, expireInMinutes: 5,
  // })
}
```

#### Rate Limiting Strategy

| Control | Mechanism |
|---------|-----------|
| Per-worker concurrency | `teamSize: 5, teamConcurrency: 5` per job type |
| Deduplication | `singletonKey` per character+syncType |
| Priority | Stalest characters first (ORDER BY `last_synced_at` ASC) |
| Adaptive intervals | Active chars (24h): 1h profile, 1h quests. Inactive: 6h |
| Backoff | `error_count` -> exponential `next_sync_after` (max 6h) |
| 304 optimization | `If-Modified-Since` header from `last_modified_header` |

### 5. Addon Upload Pipeline

#### Lua-to-JSON Parser

Direct TypeScript port of WoWThing's `LuaToJsonConverter4`. Line-by-line transform of Lua table syntax to JSON.

```typescript
// src/lib/addon/lua-parser.ts

enum StructureType { Array, Dictionary }

export function luaToJson(luaText: string): string {
  // Strip "WWTCSaved = " prefix, find first '{'
  // Recursive descent through lines:
  //   '{' -> open array or object (determined by first key type)
  //   '}' -> close current structure
  //   '["key"] = value' -> dictionary entry
  //   '[123] = value' -> dictionary entry (numeric key as string)
  //   'value,' -> array element
  //   Strip '-- comment' suffixes
  //   Strip trailing commas
  //
  // See LuaToJsonConverter4.cs for exact algorithm:
  //   - wroteOpener tracks if opener bracket was emitted
  //   - type tracks Array vs Dictionary for current level
  //   - Recurse() called for nested '{' values
  //   - WriteKey() quotes unquoted keys
  //   - WriteOpener/WriteCloser emit [ ] or { } based on type
}
```

The parser is ~150 lines. It does NOT handle arbitrary Lua — only the structured SavedVariables format the WoWThing addon produces.

#### Addon Zod Schemas

```typescript
// src/lib/addon/schema.ts
import { z } from 'zod';

// Currency format: "quantity:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty"
const currencyStringSchema = z.string().transform((s) => {
  const [qty, max, isWeekly, weekQty, weekMax, isMovingMax, totalQty] = s.split(':');
  return {
    quantity: parseInt(qty) || 0,
    max: parseInt(max) || 0,
    isWeekly: isWeekly === '1',
    weekQuantity: parseInt(weekQty) || 0,
    weekMax: parseInt(weekMax) || 0,
    isMovingMax: isMovingMax === '1',
    totalQuantity: parseInt(totalQty) || 0,
  };
});

// Progress quest format: "key|questId|name|status|expires|obj1Type~obj1Text~have~need^obj2..."
const progressQuestSchema = z.string().transform((s) => {
  const [key, questId, name, status, expires, ...objParts] = s.split('|');
  const objectives = objParts.join('|')
    ? objParts.join('|').split('^').map((obj) => {
        const [type, text, have, need] = obj.split('~');
        return { type, text, have: parseInt(have) || 0, need: parseInt(need) || 0 };
      })
    : [];
  return { key, questId: parseInt(questId), name, status: parseInt(status), expires: parseInt(expires), objectives };
});

const lockoutSchema = z.object({
  id: z.number(),
  name: z.string(),
  difficulty: z.number(),
  maxBosses: z.number(),
  defeatedBosses: z.number(),
  locked: z.boolean(),
  resetTime: z.number(),
  bosses: z.array(z.string()).optional(),
});

const uploadCharacterSchema = z.object({
  level: z.number().optional(),
  copper: z.number().optional(),
  keystoneInstance: z.number().optional(),
  keystoneLevel: z.number().optional(),
  dailyReset: z.number().optional(),
  weeklyReset: z.number().optional(),
  currencies: z.record(z.string(), currencyStringSchema).optional(),
  progressQuests: z.array(progressQuestSchema).optional(),
  dailyQuests: z.array(z.number()).optional(),
  otherQuests: z.array(z.number()).optional(),
  lockouts: z.array(lockoutSchema).optional(),
  vault: z.record(z.string(), z.array(z.any())).optional(),
  scanTimes: z.record(z.string(), z.number()).optional(),
});

export const uploadSchema = z.object({
  version: z.number(),
  battleTag: z.string(),
  chars: z.record(z.string(), uploadCharacterSchema),
});

export type AddonUpload = z.infer<typeof uploadSchema>;
export type AddonCharacter = z.infer<typeof uploadCharacterSchema>;
```

#### Upload Server Function

```typescript
// src/server/functions/upload.ts
import { createServerFn } from '@tanstack/react-start';
import { authMiddleware } from '~/lib/auth/middleware';
import { luaToJson } from '~/lib/addon/lua-parser';
import { uploadSchema } from '~/lib/addon/schema';
import { getBoss } from '~/server/plugins/pg-boss';

export const uploadAddonData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { luaText } = data as { luaText: string };
    const json = luaToJson(luaText);
    const parsed = uploadSchema.parse(JSON.parse(json));

    const boss = getBoss();
    await boss.send('process-addon-upload', {
      userId: context.userId,
      upload: parsed,
    }, {
      singletonKey: `upload-${context.userId}`,
      expireInMinutes: 10,
    });

    return { success: true, characterCount: Object.keys(parsed.chars).length };
  });
```

#### Addon Processing Job

```typescript
// src/lib/addon/processor.ts
export async function processAddonUpload(userId: number, upload: AddonUpload) {
  // For each character in upload.chars:
  //   1. Verify ownership (character.blizzardId matches a character owned by userId)
  //   2. Determine region from account
  //   3. processCharacterCurrencies: upsert currencies table
  //   4. processCharacterQuests: insert quest_completions (daily + weekly)
  //   5. processCharacterWeekly: upsert weekly_activities (vault, keystone, lockouts)
  //
  // Currency upsert: ON CONFLICT (character_id, currency_id) DO UPDATE
  // Quest completions: ON CONFLICT DO NOTHING (idempotent)
  // Weekly activities: ON CONFLICT (character_id, reset_week) DO UPDATE
  //
  // Difficulty ID mapping: 7=LFR, 14=normal, 15=heroic, 16=mythic
  // Vault tiers: t1=M+, t3=Raid, t6=World
}
```

### 6. pg-boss Nitro Plugin (Complete)

All workers and cron jobs registered in one place.

```typescript
// src/server/plugins/pg-boss.ts
import { defineNitroPlugin } from 'nitropack/runtime';
import PgBoss from 'pg-boss';
import { syncCharacterProfile, syncCharacterQuests, syncCharacterReputations } from '~/lib/blizzard/sync';
import { syncUserProfile } from '~/lib/blizzard/sync-profile';
import { scheduleCharacterSyncs } from '~/lib/blizzard/scheduler';
import { processAddonUpload } from '~/lib/addon/processor';

export type JobRegistry = {
  'sync-user-profile': { userId: string; accessToken: string; region: string };
  'sync-character-profile': { characterId: number; region: string };
  'sync-character-quests': { characterId: number; region: string };
  'sync-character-reputations': { characterId: number; region: string };
  'process-addon-upload': { userId: number; upload: unknown };
  'schedule-syncs': Record<string, never>;
  'session-cleanup': Record<string, never>;
};

let bossInstance: PgBoss | null = null;
export function getBoss(): PgBoss {
  if (!bossInstance) throw new Error('pg-boss not initialized');
  return bossInstance;
}

export default defineNitroPlugin(async (nitro) => {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: 'pgboss' });
  await boss.start();
  bossInstance = boss;

  // === Blizzard API sync workers ===
  await boss.work('sync-user-profile', { teamSize: 2, teamConcurrency: 2 }, async (job) => {
    await syncUserProfile(job.data.userId, job.data.accessToken, job.data.region);
  });
  await boss.work('sync-character-profile', { teamSize: 5, teamConcurrency: 5 }, async (job) => {
    await syncCharacterProfile(job.data.characterId, job.data.region);
  });
  await boss.work('sync-character-quests', { teamSize: 5, teamConcurrency: 5 }, async (job) => {
    await syncCharacterQuests(job.data.characterId, job.data.region);
  });
  await boss.work('sync-character-reputations', { teamSize: 5, teamConcurrency: 5 }, async (job) => {
    await syncCharacterReputations(job.data.characterId, job.data.region);
  });

  // === Addon upload processing ===
  await boss.work('process-addon-upload', { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    await processAddonUpload(job.data.userId, job.data.upload);
  });

  // === Cron jobs ===
  await boss.schedule('schedule-syncs', '* * * * *'); // every minute
  await boss.work('schedule-syncs', async () => { await scheduleCharacterSyncs(boss); });

  await boss.schedule('session-cleanup', '0 3 * * *'); // daily 3am
  await boss.work('session-cleanup', async () => {
    // Delete expired sessions
  });

  // === Shutdown ===
  nitro.hooks.hook('close', async () => {
    await boss.stop({ graceful: true, timeout: 10_000 });
    bossInstance = null;
  });
});
```

### 7. Server Functions

#### getDashboardData

Main dashboard query. Parallel queries for characters (with weekly activities, quest completions, currencies), activity definitions, and renown.

```typescript
// src/server/functions/activities.ts
export const getDashboardData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const region = context.region as 'us' | 'eu' | 'kr' | 'tw';
    const resetWeek = getCurrentResetWeek(region);

    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, parseInt(userId)),
    });
    const accountIds = userAccounts.map(a => a.id);

    const [chars, definitions, userRenown] = await Promise.all([
      db.query.characters.findMany({
        where: inArray(characters.accountId, accountIds),
        with: {
          weeklyActivities: { where: eq(weeklyActivities.resetWeek, resetWeek) },
          questCompletions: { where: eq(questCompletions.resetWeek, resetWeek) },
          currencies: true,
        },
        orderBy: (c, { desc }) => [desc(c.level)],
      }),
      db.select().from(activityDefinitions)
        .where(and(eq(activityDefinitions.expansionId, 11), eq(activityDefinitions.enabled, true)))
        .orderBy(activityDefinitions.sortOrder),
      db.select().from(renown).where(eq(renown.userId, parseInt(userId))),
    ]);

    return {
      characters: chars,
      activities: definitions,
      renown: userRenown,
      resetWeek,
      nextWeeklyReset: getNextWeeklyReset(region).toISOString(),
      nextDailyReset: getNextDailyReset(region).toISOString(),
    };
  });

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
```

#### triggerSync

Manual sync button for users.

```typescript
// src/server/functions/sync.ts
export const triggerSync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const boss = getBoss();
    await boss.send('sync-user-profile', {
      userId: context.userId,
      accessToken: /* decrypt from DB */,
      region: context.region,
    }, { singletonKey: `user-profile-${context.userId}`, expireInMinutes: 5 });
    return { queued: true };
  });
```

### 8. Activity Seed System

YAML -> database seeder. Idempotent upsert on `key`.

```typescript
// src/db/seed.ts
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { db } from './index';
import { activityDefinitions } from './schema';

async function seed() {
  const raw = readFileSync('seeds/activities.yaml', 'utf-8');
  const data = parse(raw);

  for (const [i, activity] of data.activities.entries()) {
    await db.insert(activityDefinitions).values({
      expansionId: data.expansion,
      patch: data.patch,
      category: activity.category,
      key: activity.key,
      name: activity.name,
      shortName: activity.short_name,
      description: activity.description ?? null,
      resetType: activity.reset_type,
      questIds: activity.quest_ids ?? null,
      threshold: activity.threshold ?? null,
      accountWide: activity.account_wide ?? false,
      sortOrder: i,
      enabled: true,
      metadata: activity.metadata ?? null,
    }).onConflictDoUpdate({
      target: activityDefinitions.key,
      set: {
        name: activity.name,
        shortName: activity.short_name,
        description: activity.description ?? null,
        questIds: activity.quest_ids ?? null,
        threshold: activity.threshold ?? null,
        accountWide: activity.account_wide ?? false,
        sortOrder: i,
        metadata: activity.metadata ?? null,
      },
    });
  }
  console.log(`Seeded ${data.activities.length} activity definitions`);
  process.exit(0);
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
```

The seed YAML (`seeds/activities.yaml`) contains all Midnight S1 activities with confirmed IDs — full content in poc.md section 12.

### 9. Reset Time Utilities

```typescript
// src/lib/activities/resets.ts
type Region = 'us' | 'eu' | 'kr' | 'tw';

const RESET_CONFIG = {
  us: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
  eu: { dailyHour: 7,  weeklyDay: 3, weeklyHour: 7  },
  kr: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
  tw: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
} as const;

export function getNextWeeklyReset(region: Region): Date { /* see poc.md section 11 */ }
export function getNextDailyReset(region: Region): Date { /* see poc.md section 11 */ }
export function getCurrentResetWeek(region: Region): string { /* ISO week from reset */ }
export function getTodayDate(region: Region): string { /* YYYY-MM-DD adjusted for daily reset */ }
```

### 10. WoW Static Data

```typescript
// src/lib/wow/classes.ts
export const CLASS_COLORS: Record<number, { name: string; color: string }> = {
  1:  { name: 'Warrior',      color: '#C79C6E' },
  2:  { name: 'Paladin',      color: '#F58CBA' },
  3:  { name: 'Hunter',       color: '#ABD473' },
  4:  { name: 'Rogue',        color: '#FFF569' },
  5:  { name: 'Priest',       color: '#FFFFFF' },
  6:  { name: 'Death Knight', color: '#C41E3A' },
  7:  { name: 'Shaman',       color: '#0070DE' },
  8:  { name: 'Mage',         color: '#69CCF0' },
  9:  { name: 'Warlock',      color: '#9482C9' },
  10: { name: 'Monk',         color: '#00FF96' },
  11: { name: 'Druid',        color: '#FF7D0A' },
  12: { name: 'Demon Hunter', color: '#A330C9' },
  13: { name: 'Evoker',       color: '#33937F' },
};

// src/lib/wow/constants.ts
export const CHARACTER_MAX_LEVEL = 90;
export const CURRENT_EXPANSION = 11;
export const MYTHIC_PLUS_SEASON = 15;
```

### 11. Docker Compose + Dockerfile

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://wowthing:dev@postgres:5432/wowthing?sslmode=disable
      BATTLENET_CLIENT_ID: ${BATTLENET_CLIENT_ID}
      BATTLENET_CLIENT_SECRET: ${BATTLENET_CLIENT_SECRET}
      BATTLENET_REDIRECT_URI: http://localhost:3000/api/auth/callback/battlenet
      BETTER_AUTH_SECRET: dev-secret-change-in-production
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    depends_on:
      - postgres

  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: wowthing
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: wowthing
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```dockerfile
# Dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
```

### 12. Environment Variables

```
DATABASE_URL=postgres://wowthing:dev@localhost:5432/wowthing
BATTLENET_CLIENT_ID=<from Blizzard developer portal>
BATTLENET_CLIENT_SECRET=<from Blizzard developer portal>
BATTLENET_REDIRECT_URI=http://localhost:3000/api/auth/callback/battlenet
BETTER_AUTH_SECRET=<random 32+ bytes>
ENCRYPTION_KEY=<64 hex chars = 32 bytes for AES-256-GCM>
```

## Tasks

- [x] Project scaffolding and dev infrastructure
  - [x] Initialize TanStack Start project with Bun (`bun create`, app.config.ts, tsconfig, biome.json)
  - [x] Add `.npmrc` for `@fx:registry=https://npm.pkg.github.com`
  - [x] Install all dependencies (`@fx/ui@0.0.0-28fe5ad`, drizzle-orm, pg-boss, better-auth, postgres, zod, yaml, etc.)
  - [x] Create `docker-compose.yml` (app + postgres:17) and `Dockerfile` (oven/bun multi-stage)
  - [x] Set up `global.css` with Tailwind v4 + `@fx/ui/styles` import
  - [x] Create placeholder root layout (`__root.tsx`) and index route (`index.tsx`)
  - [x] Verify `bun dev` boots the app and renders the placeholder page
- [x] Database schema and migrations
  - [x] Write complete Drizzle schema (`src/db/schema.ts`) — all 10 tables with indexes, constraints, JSONB columns
  - [x] Define Drizzle relations for relational query builder (`usersRelations`, `accountsRelations`, `charactersRelations`, etc.)
  - [x] Write JSONB types (`src/db/types.ts` — `VaultSlot`, `Lockout`)
  - [x] Create database connection module (`src/db/index.ts` — drizzle + postgres.js)
  - [x] Configure `drizzle.config.ts` (schemaFilter: `['public']` to exclude pgboss)
  - [x] Run `bun db:generate` and `bun db:migrate` to create initial migration and apply it
- [ ] WoW static data and reset utilities
  - [ ] Write `src/lib/wow/classes.ts` (CLASS_COLORS for all 13 classes)
  - [ ] Write `src/lib/wow/constants.ts` (CHARACTER_MAX_LEVEL, CURRENT_EXPANSION, MYTHIC_PLUS_SEASON)
  - [ ] Implement `src/lib/activities/resets.ts` (getNextWeeklyReset, getNextDailyReset, getCurrentResetWeek, getTodayDate) per region config
- [ ] Activity seed system
  - [ ] Write `seeds/activities.yaml` with all Midnight S1 activities (quest IDs, currency IDs, instance IDs from poc.md section 12)
  - [ ] Implement `src/db/seed.ts` — YAML parser, idempotent upsert on `activity_definitions.key`
  - [ ] Verify `bun db:seed` populates the activity_definitions table correctly
- [ ] pg-boss Nitro plugin
  - [ ] Create `src/server/plugins/pg-boss.ts` skeleton — boss lifecycle (start/stop), `getBoss()` export
  - [ ] Define `JobRegistry` type for all job names and payload shapes
  - [ ] Register all workers (sync-user-profile, sync-character-profile, sync-character-quests, sync-character-reputations, process-addon-upload)
  - [ ] Register cron jobs (schedule-syncs every minute, session-cleanup daily)
  - [ ] Wire graceful shutdown via `nitro.hooks.hook('close', ...)`
- [ ] Authentication (Better Auth + Battle.net)
  - [ ] Configure Better Auth with Drizzle adapter and Battle.net custom OAuth2 provider (`src/lib/auth/index.ts`)
  - [ ] Implement AES-256-GCM token encryption/decryption (`src/lib/auth/encryption.ts`)
  - [ ] Create auth middleware for server functions (`src/lib/auth/middleware.ts`)
  - [ ] Create Better Auth catch-all API route (`src/routes/api/auth/$.ts`)
  - [ ] Add post-login hook to enqueue initial user profile sync job
  - [ ] Set up environment variables (BATTLENET_CLIENT_ID, BATTLENET_CLIENT_SECRET, BETTER_AUTH_SECRET, ENCRYPTION_KEY)
  - [ ] Test full login flow: Battle.net redirect → callback → session cookie → redirect to dashboard
- [ ] Blizzard API client
  - [ ] Implement `BlizzardClient` class with Zod-validated `fetch()`, 304 support, and error classes (`src/lib/blizzard/client.ts`)
  - [ ] Write Zod schemas for all API responses (`src/lib/blizzard/schemas.ts` — userProfile, characterProfile, completedQuests, reputations)
- [ ] Blizzard API sync workers
  - [ ] Implement `syncUserProfile` — fetch `/profile/user/wow`, upsert accounts + characters, initialize sync_state rows (`src/lib/blizzard/sync-profile.ts`)
  - [ ] Implement `syncCharacterProfile` — fetch character endpoint, upsert level/ilvl/class, update sync_state (`src/lib/blizzard/sync.ts`)
  - [ ] Implement `syncCharacterQuests` — fetch completed quests, insert quest_completions for current reset week
  - [ ] Implement `syncCharacterReputations` — fetch reputations, upsert renown for Midnight factions
  - [ ] Implement sync_state helpers: `getSyncState`, `updateSyncState`, `incrementSyncError` with exponential backoff
  - [ ] Implement token refresh logic for expired Blizzard access tokens
- [ ] Blizzard API scheduler
  - [ ] Implement `scheduleCharacterSyncs` — query sync_state for due characters, enqueue jobs with singletonKey dedup (`src/lib/blizzard/scheduler.ts`)
- [ ] Addon upload pipeline: Lua parser
  - [ ] Port `LuaToJsonConverter4` from C# to TypeScript (`src/lib/addon/lua-parser.ts`)
  - [ ] Handle: nested tables, `["key"] = value`, `[123] = value`, Lua comments, trailing commas, `WWTCSaved =` prefix
  - [ ] Write tests for the parser against sample SavedVariables output
- [ ] Addon upload pipeline: Zod schemas and server function
  - [ ] Write Zod schemas for addon data (`src/lib/addon/schema.ts` — currencyString, progressQuest, lockout, uploadCharacter, upload)
  - [ ] Implement `uploadAddonData` server function (`src/server/functions/upload.ts`) — parse Lua, validate, enqueue pg-boss job
- [ ] Addon upload pipeline: processing job
  - [ ] Implement `processAddonUpload` entry point with ownership verification (`src/lib/addon/processor.ts`)
  - [ ] Implement `processCharacterCurrencies` — upsert currencies table with weekly cap data
  - [ ] Implement `processCharacterQuests` — insert daily + weekly quest completions
  - [ ] Implement `processCharacterWeekly` — upsert weekly_activities (vault, keystone, lockouts)
  - [ ] Handle difficulty ID mapping (7=LFR, 14=normal, 15=heroic, 16=mythic) and vault tier mapping (t1=M+, t3=Raid, t6=World)
- [ ] Server functions for frontend
  - [ ] Implement `getDashboardData` — parallel queries for characters (with relations), activity definitions, renown; return reset timestamps (`src/server/functions/activities.ts`)
  - [ ] Implement `triggerSync` — enqueue user profile sync job (`src/server/functions/sync.ts`)
  - [ ] Export `DashboardData` type for frontend consumption

## Open Questions

1. **Better Auth table reconciliation** — Better Auth creates its own `user`/`session`/`account` tables. Our Drizzle schema also defines `users` and `sessions`. Options: (a) let Better Auth own auth tables, link domain tables to its user ID; (b) customize Better Auth's adapter to use our schema. Recommend (a) for speed.

2. **Token refresh** — When a Blizzard access token expires (401), Better Auth may handle refresh automatically for OAuth providers, or we may need custom logic. Need to verify.

3. **Character deduplication** — `blizzardId` unique constraint may need to be scoped to `accountId` rather than globally unique, since a character could theoretically appear across regions.

4. **Vault data format** — The addon's vault format needs reverse-engineering against a real upload. May need to simplify for POC.

## References

- [docs/poc.md](../poc.md) — Sections 4-9, 11-14
- [TanStack Start docs](https://tanstack.com/start/latest)
- [Drizzle ORM docs](https://orm.drizzle.team)
- [pg-boss docs](https://github.com/timgit/pg-boss)
- [Better Auth docs](https://www.better-auth.com)
- [Blizzard API docs](https://develop.battle.net/documentation/world-of-warcraft/profile-apis)
- [WoWThing LuaToJsonConverter4](https://github.com/ThingEngineering/wowthing-again/blob/master/packages/csharp-lib/Utilities/LuaToJsonConverter4.cs)
- [@fx/ui](https://github.com/fx/ui) — v0.0.0-28fe5ad
