# WoWThing Reimagined: Midnight Activity Tracker

## Proof of Concept

A simplified, modern reimagining of [WoWThing](https://github.com/ThingEngineering/wowthing-again) focused exclusively on tracking weekly and daily character activities for World of Warcraft: Midnight (expansion 11, patch 12.0.x). Designed to be extended to full WoWThing functionality later.

---

## Table of Contents

1. [Motivation & Critique of WoWThing](#1-motivation--critique-of-wowthing)
2. [Design Principles](#2-design-principles)
3. [Scope: What We Track](#3-scope-what-we-track)
4. [Architecture Overview](#4-architecture-overview)
5. [Tech Stack](#5-tech-stack)
6. [Data Model](#6-data-model)
7. [Blizzard API Integration](#7-blizzard-api-integration)
8. [Addon Data Upload](#8-addon-data-upload)
9. [Backend Design](#9-backend-design)
10. [Frontend Design](#10-frontend-design)
11. [Reset Timer System](#11-reset-timer-system)
12. [Activity Definitions](#12-activity-definitions)
13. [Authentication Flow](#13-authentication-flow)
14. [Deployment](#14-deployment)
15. [Extension Path](#15-extension-path-toward-full-wowthing)
16. [Open Questions](#16-open-questions)

---

## 1. Motivation & Critique of WoWThing

### What WoWThing Does Well
- Comprehensive tracking of almost every WoW system across all expansions
- Real-time updates via SignalR WebSocket hub
- Efficient binary serialization (Bebop) for large datasets
- Rich task/chore system with dynamic quest ID resolution and custom reset periods

### What We Want to Improve

#### Backend
| Problem | Detail |
|---------|--------|
| **Monolithic C#/.NET backend** | 5 separate .NET projects (Backend, Web, Tool, LuaParser, Discord) plus a shared library. High complexity for what is fundamentally a data pipeline + API server. |
| **Heavy job system** | Custom in-memory channel-based job queue with database persistence (`QueuedJob` table), 4 priority levels, `SchedulerService` + `JobQueueService` + `WorkerService` running as a .NET Worker Service. Overkill when most jobs are just "fetch URL, store result." |
| **PostgreSQL + Redis + EF Core** | Three infrastructure dependencies before you can run the app. EF Core migrations are brittle across the 90+ database tables. |
| **Tightly coupled data pipeline** | OAuth token management, API fetching, response parsing, and database writes all happen inside individual `Job` classes with inheritance from `JobBase`. Hard to test, hard to extend. |
| **No API documentation** | Web controllers serve both HTML pages and JSON APIs with no OpenAPI spec. |

#### Frontend
| Problem | Detail |
|---------|--------|
| **Svelte SPA with no SSR** | `svelte-spa-router` with hash-based routing. No server-side rendering, no SEO, slow initial load with all data fetched client-side. |
| **Massive client-side state** | Entire user dataset (all characters, all quests, all currencies, all collections) loaded into memory on page load. The `UserData` type is enormous. |
| **Data embedded in HTML attributes** | Static data URLs passed via `data-*` attributes on the HTML body, parsed at boot. Fragile coupling between server-rendered HTML and SPA. |
| **Overwhelming UX** | The HomeTable tries to show everything at once: gold, bag space, currencies, professions, M+ scores, keystones, lockouts, vault status, and custom tasks - all in a single horizontally-scrolling table. New users face a wall of cryptic abbreviations and icons. |
| **Hardcoded quest IDs everywhere** | Activity definitions are TypeScript files with raw quest ID arrays (e.g., `questIds: [93751, 93752, ...]`). No way to update without a code deploy. |
| **Multi-entry-point Vite build** | 4 separate SPA entry points (user-home, admin, auctions, leaderboards) with shared packages - complex build configuration. |

#### General
| Problem | Detail |
|---------|--------|
| **Docker-compose with 5 services** | postgres, redis, backend, web, frontend - heavy local dev setup. |
| **No mobile support** | The character matrix table is desktop-only. No responsive design. |
| **All-or-nothing data model** | You can't use WoWThing for just Midnight chores without loading data for Classic through The War Within. |

---

## 2. Design Principles

1. **Midnight-first, expansion-aware**: Ship with only Midnight S1 activities. The data model supports future expansions but doesn't load them.
2. **All TypeScript**: One language across the entire stack. Server functions, database queries, UI components - all TypeScript.
3. **SSR by default**: TanStack Start renders pages on the server. Fast initial load, works without JS, hydrates for interactivity.
4. **Mobile-friendly from day one**: Card-based responsive layout, not a giant table.
5. **Data-driven activities**: Activity definitions live in the database (seeded from config), not hardcoded in UI components.
6. **Opinionated defaults**: Show exactly the Midnight weekly/daily checklist. No 50-column customizable matrix on first load.
7. **Type-safe end-to-end**: Drizzle ORM for type-safe queries, TanStack Router for type-safe routes, server functions for type-safe RPCs.

---

## 3. Scope: What We Track

### Midnight Season 1 Weekly Activities

| Activity | Reset | How We Track | Source |
|----------|-------|-------------|--------|
| **Great Vault: M+ Slots** | Weekly | Runs completed (1/4/8 thresholds) + highest key per slot | **Addon** (vault data) + API fallback |
| **Great Vault: Raid Slots** | Weekly | Unique bosses killed (2/4/6 thresholds) | **Addon** (vault data) + API fallback |
| **Great Vault: World Slots** | Weekly | Delves/activities completed (2/4/8 thresholds) | **Addon** (vault data) + API fallback |
| **Unity Quest** | Weekly | One of 13 rotating quests (Abundance, Delves, Dungeons, Prey, Raid, etc.) | **Addon** (quest progress + completion) |
| **Hope Quest** (sub-90) | Weekly | "Hope in the Darkest Corners" for leveling characters | **Addon** (quest completion) |
| **Special Assignment 1** | Weekly | Unlock via world quests -> complete assignment | **Addon** (progress quests with objectives) |
| **Special Assignment 2** | Weekly | Second special assignment slot | **Addon** (progress quests with objectives) |
| **Dungeon Weekly** | Weekly | Account-wide, one of 8 specific dungeons | **Addon** (quest completion) |
| **Prey Hunts** | Weekly | 4 hunts for max efficiency (Normal/Hard/Nightmare) | **Addon** (quest completion/progress) |
| **Dawncrest Caps** (5 types) | Weekly | Current / 100 cap per tier (Adventurer->Myth) | **Addon** (currencies with weekly caps) |
| **Raid Lockouts** | Weekly | Per-difficulty boss kill tracking for Voidspire/16340 (6), Dreamrift/16531 (1), March on Quel'Danas/16215 (2) | **Addon** (lockout data) |
| **Mythic+ Keystone** | Weekly | Current dungeon + level | **Addon** (keystone instance + level) |

### Midnight Daily Activities

| Activity | Reset | How We Track | Source |
|----------|-------|-------------|--------|
| **Bountiful Delves** | Daily | Which delves are bountiful today, completion status | **Addon** (daily quests) |
| **World Quests** | ~Daily | Available world quests across 4 zones | **Addon** (world quest data) |

### Midnight Renown (Account-wide)

| Faction | Zone | Cap |
|---------|------|-----|
| Silvermoon Court | Eversong Woods | Renown 20 |
| Amani Tribe | Zul'Aman | Renown 20 |
| Hara'ti | Harandar | Renown 20 |
| Singularity | Voidstorm | Renown 20 |

### Midnight Currencies

| Currency | ID | Weekly Cap | Purpose |
|----------|-----|-----------|---------|
| Adventurer Dawncrest | 3383 | 100 | ilvl 224-237 upgrades |
| Veteran Dawncrest | 3341 | 100 | ilvl 237-250 upgrades |
| Champion Dawncrest | 3343 | 100 | ilvl 250-263 upgrades |
| Hero Dawncrest | 3345 | 100 | ilvl 263-276 upgrades |
| Myth Dawncrest | 3348 | 100 | ilvl 276-289 upgrades |
| Voidlight Marl | 3316 | None | Renown vendor purchases |
| Resonance Crystals | 2815 | None | Delve seasonal currency |

### Explicitly Out of Scope (v1)

- Collections (mounts, pets, toys, transmog)
- Auction house data
- Professions and crafting
- Player housing / neighborhoods
- PvP tracking
- Guild data
- Achievement tracking
- Historic expansions (Classic through The War Within)
- Leaderboards
- Discord integration

---

## 4. Architecture Overview

```
                    +-----------------------------------+
                    |         Blizzard API              |
                    |  (OAuth2 + Profile/Data APIs)     |
                    +----------------+------------------+
                                     |
                    +----------------v------------------+
                    |        TanStack Start App         |
                    |                                   |
                    |  +-------------+ +--------------+ |
                    |  | TanStack    | | pg-boss      | |
                    |  | Router +   | | Workers      | |
                    |  | Server Fns | | (sync jobs,  | |
                    |  | (SSR +     | |  scheduled   | |
                    |  |  API)      | |  tasks)      | |
                    |  +------+-----+ +------+-------+ |
                    |         |              |         |
                    |  +------v--------------v-------+ |
                    |  |     Drizzle ORM             | |
                    |  |  (type-safe query layer)    | |
                    |  +-------------+---------------+ |
                    |                |                  |
                    |  +-------------v---------------+ |
                    |  |        PostgreSQL            | |
                    |  |  +----------+ +-----------+  | |
                    |  |  | Data     | | Jobs      |  | |
                    |  |  | Store    | | Queue     |  | |
                    |  |  | (Drizzle)| | (pg-boss) |  | |
                    |  |  +----------+ +-----------+  | |
                    |  +-----------------------------+ |
                    +----------------------------------+
                                     |
                    +----------------v------------------+
                    |        Browser                    |
                    |  SSR HTML + React hydration       |
                    |  TanStack Router (client nav)     |
                    |  TanStack Query (cache + refetch) |
                    +-----------------------------------+
```

### PostgreSQL as Infrastructure

We use PostgreSQL for **everything** WoWThing uses Redis + custom job queues for:

| Concern | WoWThing | This Project |
|---------|----------|-------------|
| **Job queue** | Custom in-memory channels + `QueuedJob` DB table + 4 priority workers | **pg-boss** - uses `SKIP LOCKED` for exactly-once delivery, built-in retries, scheduling, and cron |
| **Cache headers** | Redis keys for `Last-Modified` headers | **`sync_state` table** - same data, queryable, no eviction surprises |
| **Sessions** | ASP.NET Identity + Redis session store | **`sessions` table** - cookie references a DB row, simple and auditable |
| **Rate limiting** | Polly (in-memory) | **pg-boss rate limiting** - `teamSize` + `teamConcurrency` per queue controls parallelism |
| **Scheduled tasks** | `SchedulerService` polling every 5s | **pg-boss `schedule()`** - cron-like schedules stored in PG, survives restarts |
| **Real-time updates** | Redis pub/sub + SignalR WebSocket | **TanStack Query** - `staleTime` + refetch on window focus + manual invalidation. Simple polling, no push infrastructure. |

This eliminates Redis entirely and replaces WoWThing's ~2000 lines of job infrastructure with a well-tested library that uses our existing database.

### Key Simplifications vs WoWThing

| WoWThing | This Project |
|----------|-------------|
| 5 .NET projects + shared lib | 1 TanStack Start app |
| C# backend + Svelte frontend | All TypeScript |
| PostgreSQL + Redis | PostgreSQL only (jobs, pub/sub, sessions, data) |
| 4 job priority queues + DB-backed queue | pg-boss (`SKIP LOCKED`, cron schedules, retries) |
| Svelte SPA + SignalR | SSR React + TanStack Query (stale-while-revalidate) |
| 90+ database tables | ~15 tables (+pg-boss managed schema) |
| All expansions loaded | Midnight only, expansion-scoped by design |
| Bebop binary protocol | JSON (type-safe via Drizzle + server functions) |
| Custom build with 4 Vite entry points | Single TanStack Start build |
| EF Core ORM | Drizzle ORM (lightweight, SQL-close, type-safe) |

---

## 5. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | TanStack Start (RC) | Full-stack React with SSR, server functions, file-based routing |
| **Routing** | TanStack Router | Type-safe file-based routing with loaders and search params |
| **Data Fetching** | TanStack Query | Cache management, background refetching, optimistic updates |
| **Server Functions** | TanStack Start server fns | Type-safe RPCs, middleware composition, runs on server only |
| **Database** | PostgreSQL 17 | Proven, JSONB for flexible structures, great ecosystem |
| **ORM** | Drizzle ORM | Type-safe, SQL-close, lightweight, excellent DX with `drizzle-kit` |
| **Migrations** | drizzle-kit | Schema-driven migrations from TypeScript definitions |
| **Auth** | Better Auth | Battle.net OAuth2 via custom provider, TanStack Start integration, session cookies |
| **Styling** | Tailwind CSS 4 | Utility-first, responsive, inline theming |
| **UI Components** | @fx/ui (primary) | React 19 + Base UI component library with Tailwind CSS v4 and CVA variants. 30+ components including Button, Badge, Card, Progress, Table, Dialog, Sheet, Toast, etc. For any component @fx/ui doesn't provide, use shadcn + Base UI to match styling. |
| **Job Queue** | pg-boss | PostgreSQL-backed job queue with `SKIP LOCKED`, cron schedules, retries, type-safe |
| **Validation** | Zod | Schema validation for API responses and form data |
| **Runtime** | Node.js 22+ | LTS, stable, good TypeScript support |
| **Package Manager** | Bun | Fast runtime and package manager |

### Why This Stack?

- **TanStack Start** gives us SSR + server functions + file-based routing in one framework. No separate API server needed.
- **Drizzle** is the closest thing to "SQL with types" - no magic, no heavy ORM abstraction, but full type inference from schema to query result.
- **TanStack Query** handles the client-side cache layer - stale-while-revalidate, background refetching, and cache invalidation all built in.
- **Server functions** replace WoWThing's entire ASP.NET controller layer. Type-safe from database to component, zero API boilerplate.
- **pg-boss** replaces WoWThing's ~2000 lines of custom job infrastructure (4 priority queues, `SchedulerService`, `JobQueueService`, `WorkerService`) with a battle-tested library that uses our existing PostgreSQL. Jobs are durable, retryable, and scheduled with cron expressions - all backed by `SKIP LOCKED`.
- **PostgreSQL for everything**: No Redis. Job queue (`pg-boss`), sessions, sync state cache - all in the one database we already have. One connection string, one backup strategy, one thing to monitor.

---

## 6. Data Model

### Drizzle Schema

```typescript
// src/db/schema.ts
import { pgTable, text, integer, boolean, timestamp, jsonb, serial, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ============================================================
// Users & Auth
// ============================================================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  battleNetId: integer('battle_net_id').notNull().unique(),
  battleTag: text('battle_tag').notNull(),
  accessToken: text('access_token').notNull(),      // encrypted at rest
  refreshToken: text('refresh_token'),                // encrypted at rest
  tokenExpiresAt: timestamp('token_expires_at').notNull(),
  region: text('region').notNull(),                   // 'us' | 'eu' | 'kr' | 'tw'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// Characters
// ============================================================
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  battleNetAccountId: integer('battle_net_account_id').notNull(),
  region: text('region').notNull(),
  displayName: text('display_name'),
});

export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  blizzardId: integer('blizzard_id').notNull(),       // Blizzard's character ID
  name: text('name').notNull(),
  realmSlug: text('realm_slug').notNull(),
  classId: integer('class_id').notNull(),
  raceId: integer('race_id').notNull(),
  faction: text('faction').notNull(),                  // 'alliance' | 'horde'
  level: integer('level').notNull(),
  itemLevel: integer('item_level'),
  lastApiSyncAt: timestamp('last_api_sync_at'),
  lastApiModified: text('last_api_modified'),          // Last-Modified header for 304
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_characters_account').on(t.accountId),
]);

// ============================================================
// Weekly Activity Snapshots
// ============================================================
export const weeklyActivities = pgTable('weekly_activities', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  resetWeek: text('reset_week').notNull(),            // e.g. "2026-W10"

  // Great Vault progress
  vaultDungeonProgress: jsonb('vault_dungeon_progress'),  // VaultSlot[]
  vaultRaidProgress: jsonb('vault_raid_progress'),        // VaultSlot[]
  vaultWorldProgress: jsonb('vault_world_progress'),      // VaultSlot[]
  vaultHasRewards: boolean('vault_has_rewards').default(false),

  // Current keystone
  keystoneDungeonId: integer('keystone_dungeon_id'),
  keystoneLevel: integer('keystone_level'),

  // Raid lockouts
  lockouts: jsonb('lockouts'),                            // Lockout[]

  syncedAt: timestamp('synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_weekly_char_week').on(t.characterId, t.resetWeek),
]);

// ============================================================
// Quest Completions (weekly/daily scoped)
// ============================================================
export const questCompletions = pgTable('quest_completions', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  questId: integer('quest_id').notNull(),
  resetType: text('reset_type').notNull(),             // 'daily' | 'weekly'
  resetWeek: text('reset_week'),                       // for weekly quests
  resetDate: text('reset_date'),                       // for daily quests (YYYY-MM-DD)
  completedAt: timestamp('completed_at').defaultNow().notNull(),
}, (t) => [
  index('idx_quests_char_quest_week').on(t.characterId, t.questId, t.resetWeek),
  index('idx_quests_char_quest_date').on(t.characterId, t.questId, t.resetDate),
]);

// ============================================================
// Currencies
// ============================================================
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

// ============================================================
// Renown (Warband-wide / per-user)
// ============================================================
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

// ============================================================
// Activity Definitions (seeded, data-driven)
// ============================================================
export const activityDefinitions = pgTable('activity_definitions', {
  id: serial('id').primaryKey(),
  expansionId: integer('expansion_id').notNull(),      // 11 = Midnight
  patch: text('patch').notNull(),                      // "12.0.0"
  category: text('category').notNull(),                // 'weekly' | 'daily'
  key: text('key').notNull().unique(),                 // unique slug
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  description: text('description'),
  resetType: text('reset_type').notNull(),             // 'daily' | 'weekly' | 'biweekly'
  questIds: integer('quest_ids').array(),              // possible quest IDs
  threshold: integer('threshold'),                     // count needed (null = any 1)
  accountWide: boolean('account_wide').default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: boolean('enabled').default(true),
  metadata: jsonb('metadata'),                         // icon, sub-activities, display hints
}, (t) => [
  index('idx_activity_defs_expansion').on(t.expansionId, t.category),
]);

// ============================================================
// Sessions (PostgreSQL-backed, replaces Redis)
// ============================================================
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),                         // random token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_sessions_user').on(t.userId),
  index('idx_sessions_expires').on(t.expiresAt),
]);

// ============================================================
// Sync State (replaces Redis caching)
// ============================================================
export const syncState = pgTable('sync_state', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  syncType: text('sync_type').notNull(),               // 'profile' | 'quests' | 'currencies' | 'lockouts'
  lastSyncedAt: timestamp('last_synced_at'),
  lastModifiedHeader: text('last_modified_header'),    // for 304 optimization
  nextSyncAfter: timestamp('next_sync_after'),         // rate limiting / backoff
  errorCount: integer('error_count').default(0),
}, (t) => [
  uniqueIndex('idx_sync_char_type').on(t.characterId, t.syncType),
  index('idx_sync_next').on(t.nextSyncAfter),
]);

// ============================================================
// pg-boss (managed automatically)
// ============================================================
// pg-boss creates and manages its own schema (`pgboss.*`) with tables for:
//   - job: the main job queue (uses SKIP LOCKED for exactly-once delivery)
//   - schedule: cron-based recurring job definitions
//   - subscription: active worker registrations
//   - archive: completed/failed job history
// We do NOT define these in Drizzle - pg-boss owns them entirely.
```

### JSONB Types

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

### Key Design Decisions

1. **`weekly_activities` uses `reset_week`**: Instead of relying on timestamps and reset calculations to determine "current week," we store an explicit week identifier. When the weekly reset fires, new rows are created. Old weeks are retained for history.

2. **`quest_completions` is append-only with reset scope**: Each completed quest gets a row tagged with its reset period. To check "did character X complete quest Y this week?", query by `character_id + quest_id + reset_week`. This avoids WoWThing's pattern of loading *all* completed quest IDs into memory.

3. **`activity_definitions` are database rows**: Unlike WoWThing where activities are TypeScript code with embedded quest IDs and dynamic functions, we seed them from config but store them in the DB. Activities can be added/modified without a code deploy.

4. **`renown` is per-user not per-character**: Midnight renown is warband-wide, so we store it at the user level.

5. **`sync_state` replaces Redis**: WoWThing uses Redis to store Last-Modified headers and sync timestamps. We store these in a simple table. TanStack Query handles client-side caching.

6. **JSONB for vault progress and lockouts**: These are complex nested structures that change shape across patches. JSONB avoids migration churn while remaining queryable.

---

## 7. Blizzard API Integration

### APIs We Use

| API | Endpoint | Data | Frequency |
|-----|----------|------|-----------|
| **User Profile** | `GET /profile/user/wow` | Account list, character roster | On login + every 6h |
| **Character Profile** | `GET /profile/wow/character/{realm}/{name}` | Level, ilvl, class, race, faction | Every 2h per character |
| **Character Quests** | `GET /profile/wow/character/{realm}/{name}/quests/completed` | Completed quest IDs | Every 1h (active characters) |
| **Character M+ Profile** | `GET /profile/wow/character/{realm}/{name}/mythic-keystone-profile` | Current keystone, season scores | Every 1h |
| **Character Reputations** | `GET /profile/wow/character/{realm}/{name}/reputations` | Faction standings / renown | Every 4h |

### Blizzard API Client

```typescript
// src/lib/blizzard/client.ts
import { z } from 'zod';

const BLIZZARD_API_HOSTS = {
  us: 'https://us.api.blizzard.com',
  eu: 'https://eu.api.blizzard.com',
  kr: 'https://kr.api.blizzard.com',
  tw: 'https://tw.api.blizzard.com',
} as const;

type Region = keyof typeof BLIZZARD_API_HOSTS;

export class BlizzardClient {
  constructor(
    private accessToken: string,
    private region: Region,
  ) {}

  async fetch<T>(path: string, schema: z.ZodType<T>, ifModifiedSince?: string): Promise<{
    data: T | null;
    lastModified: string | null;
    notModified: boolean;
  }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (ifModifiedSince) {
      headers['If-Modified-Since'] = ifModifiedSince;
    }

    const res = await fetch(`${BLIZZARD_API_HOSTS[this.region]}${path}`, { headers });

    if (res.status === 304) {
      return { data: null, lastModified: ifModifiedSince!, notModified: true };
    }
    if (!res.ok) {
      throw new BlizzardApiError(res.status, await res.text());
    }

    const json = await res.json();
    const data = schema.parse(json);
    return {
      data,
      lastModified: res.headers.get('Last-Modified'),
      notModified: false,
    };
  }
}
```

### Rate Limiting Strategy

Blizzard allows 100 requests/second with a 36,000/hour budget. Our approach:

- **Priority by staleness**: Characters not synced in longest get priority (scheduler queries `sync_state` ordered by `last_synced_at`)
- **Adaptive intervals**: Active characters (logged in last 24h) sync hourly; others every 6h. Controlled via `next_sync_after` in `sync_state`.
- **304 Not Modified**: Store `Last-Modified` header per endpoint per character in `sync_state`. Skip processing on 304.
- **Backoff on errors**: pg-boss `retryLimit: 3` + `retryDelay: 60` handles transient failures. Persistent failures increment `error_count` in `sync_state` and push `next_sync_after` further out.
- **Concurrency control**: pg-boss `teamSize: 5` per job type = max 5 concurrent API requests per sync type. Total parallelism stays well under Blizzard's 100 req/s limit.
- **Deduplication**: pg-boss `singletonKey` per character+syncType prevents duplicate jobs. If a sync is already queued, no duplicate is created.

---

## 8. Addon Data Upload

### Why the Addon is Essential

The Blizzard API is incomplete for weekly/daily activity tracking. Critical data that **only comes from the addon**:

| Data | Why API Can't Provide It |
|------|------------------------|
| **Currency weekly caps** (quantity/max/weekQty/weekMax) | API gives total quantity but not weekly progress toward cap |
| **In-progress quest objectives** (have/need per objective) | API only gives completed quest IDs, not in-progress status |
| **Daily quest completion** (which dailies done today) | API gives lifetime completed quests, no daily scoping |
| **Vault status** (available/generated rewards, tier progress) | API has some vault data but addon is fresher and more detailed |
| **Keystone dungeon + level** | API M+ profile is delayed; addon has real-time keystone info |
| **Lockout details** (boss names, reset times, difficulty) | API lockout data exists but is less structured |
| **Character reset timestamps** (dailyReset, weeklyReset) | Region defaults work, but addon gives exact per-character reset times |

### The WoWThing Addon

We use the existing [WoWThing Collector addon](https://github.com/ThingEngineering/wowthing-again). It exports a Lua SavedVariables file (`WoWthing_Collector.lua`) that users upload manually.

The addon writes a `WWTCSaved` Lua table to WoW's SavedVariables directory at:
```
<WoW Install>/WTF/Account/<ACCOUNT>/SavedVariables/WoWthing_Collector.lua
```

### Upload Flow

```
User plays WoW → addon scans character data → writes SavedVariables
    ↓
User opens our app → drags/drops .lua file (or pastes text)
    ↓
POST /api/upload → server receives raw Lua text
    ↓
pg-boss job: parse-addon-upload
    ↓
Lua parser → JSON → validate with Zod → upsert to database
    ↓
TanStack Query refetch picks up new data on dashboard
```

### Lua SavedVariables Format

The addon outputs nested Lua tables. Top level:

```lua
WWTCSaved = {
    ["version"] = 123,
    ["battleTag"] = "Player#1234",
    ["chars"] = {
        ["12345678"] = {  -- character ID
            ["level"] = 90,
            ["copper"] = 12345678,
            ["keystoneInstance"] = 1234,
            ["keystoneLevel"] = 15,
            ["dailyReset"] = 1741305600,
            ["weeklyReset"] = 1741305600,
            -- currencies: "quantity:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty"
            ["currencies"] = {
                [3008] = "450:0:0:0:0:0:450",      -- Valorstones
                [2806] = "88:100:1:88:100:0:88",    -- Dawncrest (weekly cap!)
            },
            -- quest progress: "key|questId|name|status|expires|obj1Type~obj1Text~have~need^obj2..."
            ["progressQuests"] = {
                "q93890|93890|Midnight: Abundance|1|0|progress~Complete the event~3~5",
            },
            ["dailyQuests"] = { 12345, 12346, 12347 },
            ["otherQuests"] = { 93751, 95468 },
            ["lockouts"] = {
                {
                    ["id"] = 1234,
                    ["name"] = "Voidspire",
                    ["difficulty"] = 15,
                    ["maxBosses"] = 6,
                    ["defeatedBosses"] = 4,
                    ["locked"] = true,
                    ["resetTime"] = 1741305600,
                    ["bosses"] = { "Boss1*true", "Boss2*true", "Boss3*false", ... },
                },
            },
            ["vault"] = {
                ["t1"] = { { ... } },  -- M+ tiers
                ["t3"] = { { ... } },  -- Raid tiers
                ["t6"] = { { ... } },  -- World tiers
            },
            ["scanTimes"] = {
                ["currencies"] = 1741234567,
                ["quests"] = 1741234567,
                ["vault"] = 1741234567,
            },
        },
    },
}
```

### Lua Parser

WoWThing's Lua parser (`LuaToJsonConverter4`) converts Lua syntax to JSON line-by-line. We rewrite this in TypeScript:

```typescript
// src/lib/addon/lua-parser.ts

/**
 * Convert WoWThing addon SavedVariables Lua to JSON.
 * Handles: nested tables, string/number keys, comments, trailing commas.
 */
export function luaToJson(lua: string): string {
  // The Lua format is close enough to JSON that a line-by-line transform works:
  // 1. Strip "WWTCSaved = " prefix
  // 2. Convert ["key"] = value  →  "key": value
  // 3. Convert [123] = value    →  "123": value (numeric keys become strings)
  // 4. Strip Lua comments (-- ...)
  // 5. Convert { } table syntax to JSON object/array syntax
  // 6. Handle trailing commas
  // ...
}
```

The parser doesn't need to handle arbitrary Lua - just the structured SavedVariables format. WoWThing's C# parser is ~200 lines; ours will be similar.

### Upload Zod Schema

```typescript
// src/lib/addon/schema.ts
import { z } from 'zod';

const currencyStringSchema = z.string().transform((s) => {
  // "quantity:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty"
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

const progressQuestSchema = z.string().transform((s) => {
  // "key|questId|name|status|expires|obj1Type~obj1Text~have~need^obj2..."
  const [key, questId, name, status, expires, ...objectiveParts] = s.split('|');
  const objectiveStr = objectiveParts.join('|');
  const objectives = objectiveStr ? objectiveStr.split('^').map((obj) => {
    const [type, text, have, need] = obj.split('~');
    return { type, text, have: parseInt(have) || 0, need: parseInt(need) || 0 };
  }) : [];
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
  bosses: z.array(z.string()).optional(), // "BossName*killed"
});

const uploadCharacterSchema = z.object({
  level: z.number().optional(),
  copper: z.number().optional(),
  keystoneInstance: z.number().optional(),
  keystoneLevel: z.number().optional(),
  dailyReset: z.number().optional(),
  weeklyReset: z.number().optional(),
  delvesGilded: z.number().optional(),
  isWarMode: z.boolean().optional(),
  isResting: z.boolean().optional(),
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

### Upload Server Function

```typescript
// src/server/functions/upload.ts
import { createServerFn } from '@tanstack/react-start';
import { authMiddleware } from '~/lib/auth/middleware';
import { luaToJson } from '~/lib/addon/lua-parser';
import { uploadSchema } from '~/lib/addon/schema';
import PgBoss from 'pg-boss';

export const uploadAddonData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { luaText } = data as { luaText: string };

    // Quick validation: parse Lua -> JSON -> validate schema
    const json = luaToJson(luaText);
    const parsed = uploadSchema.parse(JSON.parse(json));

    // Enqueue processing job (heavy work happens in background)
    await boss.send('process-addon-upload', {
      userId: context.session.userId,
      upload: parsed,
    }, {
      singletonKey: `upload-${context.session.userId}`,  // one upload at a time per user
      expireInMinutes: 10,
    });

    return { success: true, characterCount: Object.keys(parsed.chars).length };
  });
```

### Upload Processing Job

```typescript
// src/lib/addon/processor.ts
import { db } from '~/db';
import { characters, currencies, questCompletions, weeklyActivities } from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { getCurrentResetWeek, getTodayDate } from '~/lib/activities/resets';
import type { AddonUpload, AddonCharacter } from './schema';

export async function processAddonUpload(userId: number, upload: AddonUpload) {
  for (const [charIdStr, charData] of Object.entries(upload.chars)) {
    const blizzardId = parseInt(charIdStr);

    // Find character in our DB (must exist from initial API sync or previous upload)
    const char = await db.query.characters.findFirst({
      where: and(
        eq(characters.blizzardId, blizzardId),
        // join through accounts to verify ownership
      ),
    });
    if (!char) continue;

    const region = char.region ?? 'us';
    const resetWeek = getCurrentResetWeek(region);

    await processCharacterCurrencies(char.id, charData);
    await processCharacterQuests(char.id, charData, resetWeek, region);
    await processCharacterWeekly(char.id, charData, resetWeek);
    await processCharacterLockouts(char.id, charData, resetWeek);
  }
}

async function processCharacterCurrencies(characterId: number, data: AddonCharacter) {
  if (!data.currencies) return;

  for (const [currencyIdStr, currency] of Object.entries(data.currencies)) {
    await db.insert(currencies).values({
      characterId,
      currencyId: parseInt(currencyIdStr),
      quantity: currency.quantity,
      maxQuantity: currency.max,
      weekQuantity: currency.weekQuantity,
      weekMax: currency.weekMax,
    }).onConflictDoUpdate({
      target: [currencies.characterId, currencies.currencyId],
      set: {
        quantity: currency.quantity,
        maxQuantity: currency.max,
        weekQuantity: currency.weekQuantity,
        weekMax: currency.weekMax,
        updatedAt: new Date(),
      },
    });
  }
}

async function processCharacterQuests(
  characterId: number, data: AddonCharacter,
  resetWeek: string, region: string
) {
  const today = getTodayDate(region);

  // Daily quest completions
  for (const questId of data.dailyQuests ?? []) {
    await db.insert(questCompletions).values({
      characterId, questId, resetType: 'daily', resetDate: today,
    }).onConflictDoNothing();
  }

  // Weekly quest completions (from "otherQuests")
  for (const questId of data.otherQuests ?? []) {
    await db.insert(questCompletions).values({
      characterId, questId, resetType: 'weekly', resetWeek,
    }).onConflictDoNothing();
  }

  // In-progress quests with objectives -> stored in weekly_activities JSONB
  // (see processCharacterWeekly)
}
```

### Upload UI

Simple drag-and-drop or file picker on the settings/upload page:

```typescript
// src/routes/upload.tsx
import { createFileRoute } from '@tanstack/react-router';
import { uploadAddonData } from '~/server/functions/upload';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/upload')({
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const queryClient = useQueryClient();

  const handleFile = useCallback(async (file: File) => {
    setStatus('uploading');
    try {
      const luaText = await file.text();
      const result = await uploadAddonData({ data: { luaText } });
      setStatus('done');
      // Invalidate dashboard data so it refetches with new addon data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setStatus('error');
    }
  }, [queryClient]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Upload Addon Data</h1>
      <p className="text-zinc-400">
        Upload your <code>WoWthing_Collector.lua</code> file from:<br />
        <code className="text-sm text-zinc-500">
          WoW/WTF/Account/YOUR_ACCOUNT/SavedVariables/WoWthing_Collector.lua
        </code>
      </p>

      <div
        className="border-2 border-dashed border-zinc-700 rounded-lg p-12 text-center
                    hover:border-zinc-500 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.lua';
          input.onchange = () => input.files?.[0] && handleFile(input.files[0]);
          input.click();
        }}
      >
        {status === 'idle' && 'Drop .lua file here or click to browse'}
        {status === 'uploading' && 'Processing...'}
        {status === 'done' && 'Upload complete! Dashboard updated.'}
        {status === 'error' && 'Upload failed. Check file format.'}
      </div>
    </div>
  );
}
```

### Data Priority: Addon vs API

When both sources provide the same data, addon wins because it's fresher (user-controlled upload timing vs API polling on a schedule):

| Data | Addon | API | Winner |
|------|-------|-----|--------|
| Currency quantities + weekly caps | Full detail including weekly caps | Total quantity only | **Addon** |
| Quest completion (weekly) | `otherQuests[]` | `/quests/completed` | **Addon** (fresher) |
| Quest progress (in-progress) | `progressQuests[]` with objectives | Not available | **Addon only** |
| Daily quest completion | `dailyQuests[]` | Not available per-day | **Addon only** |
| Vault progress | Full vault tiers with rewards | Partial via M+ profile | **Addon** |
| Keystone info | `keystoneInstance` + `keystoneLevel` | M+ profile (delayed) | **Addon** (fresher) |
| Lockouts | Detailed per-boss with names | Available but less structured | **Addon** |
| Character level/ilvl | Available | Available | Either (API for initial, addon updates) |
| Reputations/Renown | Available via addon | Available via API | **API** (more reliable) |

For the POC: addon upload is the **primary** data source for weekly/daily tracking. The Blizzard API is used for initial character discovery (on login) and as a fallback/supplement for data the addon doesn't cover (reputations, collections in future phases).

---

## 9. Backend Design

### Project Structure

```
wowthing/
├── src/
│   ├── routes/                      # TanStack file-based routes
│   │   ├── __root.tsx               # Root layout (nav, reset timers)
│   │   ├── index.tsx                # Dashboard - main activity grid
│   │   ├── characters/
│   │   │   └── $characterId.tsx     # Character detail page
│   │   ├── settings.tsx             # User settings
│   │   ├── upload.tsx               # Addon data upload page
│   │   ├── api/                     # Server routes (JSON API)
│   │   │   └── sync.ts             # POST /api/sync - manual trigger
│   │   └── auth/
│   │       ├── login.ts             # GET /auth/login -> Battle.net redirect
│   │       ├── callback.ts          # GET /auth/callback -> handle OAuth
│   │       └── logout.ts            # POST /auth/logout
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── VaultCard.tsx        # Great Vault progress for one character
│   │   │   ├── ActivityRow.tsx      # Single activity completion status
│   │   │   ├── CharacterCard.tsx    # Character overview card (mobile)
│   │   │   ├── CrestTracker.tsx     # Dawncrest cap progress bars
│   │   │   ├── RenownBar.tsx        # Renown progress bar
│   │   │   └── LockoutGrid.tsx      # Raid lockout display
│   │   ├── layout/
│   │   │   ├── Nav.tsx
│   │   │   ├── ResetTimers.tsx      # Countdown to daily/weekly reset
│   │   │   └── ClassIcon.tsx        # WoW class color + icon
│   │   └── ui/                      # @fx/ui components + custom Base UI components
│   │       ├── card.tsx
│   │       ├── progress.tsx
│   │       ├── badge.tsx
│   │       └── ...
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema (see section 6)
│   │   ├── types.ts                 # JSONB types
│   │   ├── index.ts                 # Database connection (drizzle + pg)
│   │   └── seed.ts                  # Activity definition seeder
│   ├── lib/
│   │   ├── addon/
│   │   │   ├── lua-parser.ts       # Lua SavedVariables -> JSON converter
│   │   │   ├── schema.ts           # Zod schemas for addon upload format
│   │   │   └── processor.ts        # Process parsed addon data into DB
│   │   ├── blizzard/
│   │   │   ├── client.ts           # API client with 304 support
│   │   │   ├── schemas.ts          # Zod schemas for API responses
│   │   │   └── sync.ts             # Character sync orchestration
│   │   ├── auth/
│   │   │   ├── battlenet.ts        # OAuth2 flow helpers
│   │   │   ├── session.ts          # Session management
│   │   │   └── middleware.ts        # Auth middleware for server functions
│   │   ├── activities/
│   │   │   ├── definitions.ts      # Load + cache activity definitions
│   │   │   ├── resolve.ts          # Resolve activity status for a character
│   │   │   └── resets.ts           # Reset time calculations
│   │   └── wow/
│   │       ├── classes.ts           # Class ID -> name/color/icon mapping
│   │       ├── factions.ts          # Faction data
│   │       └── constants.ts         # Game constants (max level, etc.)
│   ├── server/
│   │   ├── functions/
│   │   │   ├── activities.ts        # getActivities(), getDashboardData()
│   │   │   ├── characters.ts        # getCharacters(), getCharacterDetail()
│   │   │   ├── sync.ts             # triggerSync()
│   │   │   └── upload.ts           # uploadAddonData()
│   │   └── plugins/
│   │       └── pg-boss.ts           # Nitro plugin: start pg-boss, register workers
│   ├── hooks/
│   │   ├── useResetTimer.ts         # Client-side countdown hook
│   │   └── useActivityStatus.ts     # Compute activity completion from data
│   ├── router.tsx                   # TanStack Router configuration
│   ├── entry-client.tsx             # Client entry
│   ├── entry-server.tsx             # Server entry
│   └── global.css                   # Tailwind imports
├── drizzle/
│   └── migrations/                  # Generated SQL migrations
├── seeds/
│   └── activities.yaml              # Activity definitions seed data
├── public/
│   └── icons/                       # WoW class/spec icons
├── app.config.ts                    # TanStack Start config
├── drizzle.config.ts               # Drizzle Kit config
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
└── docker-compose.yml               # Just app + postgres (2 services)
```

### Server Functions

Server functions are the bridge between UI and database. They replace WoWThing's entire ASP.NET controller layer with type-safe RPCs:

```typescript
// src/server/functions/activities.ts
import { createServerFn } from '@tanstack/react-start';
import { db } from '~/db';
import { characters, weeklyActivities, questCompletions, currencies, renown, activityDefinitions } from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '~/lib/auth/middleware';
import { getCurrentResetWeek } from '~/lib/activities/resets';

export const getDashboardData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.userId;
    const resetWeek = getCurrentResetWeek(context.session.region);

    // Parallel queries - all type-safe via Drizzle
    const [chars, activities, definitions, userRenown] = await Promise.all([
      db.query.characters.findMany({
        where: eq(characters.accountId, /* subquery for user's accounts */),
        with: {
          weeklyActivities: {
            where: eq(weeklyActivities.resetWeek, resetWeek),
          },
          questCompletions: {
            where: eq(questCompletions.resetWeek, resetWeek),
          },
          currencies: true,
        },
        orderBy: (c, { desc }) => [desc(c.itemLevel)],
      }),
      db.select().from(activityDefinitions)
        .where(and(
          eq(activityDefinitions.expansionId, 11),
          eq(activityDefinitions.enabled, true),
        ))
        .orderBy(activityDefinitions.sortOrder),
      db.select().from(renown).where(eq(renown.userId, userId)),
    ]);

    return { characters: chars, activities, renown: userRenown, resetWeek };
  });
```

### Background Sync with pg-boss

TanStack Start runs on Nitro under the hood. We use a Nitro plugin to start pg-boss and register job workers. pg-boss manages its own schema in PostgreSQL and uses `SKIP LOCKED` for exactly-once job delivery.

```typescript
// src/server/plugins/pg-boss.ts
import { defineNitroPlugin } from 'nitropack/runtime';
import PgBoss from 'pg-boss';
import { syncCharacterProfile, syncCharacterQuests } from '~/lib/blizzard/sync';
import { scheduleCharacterSyncs } from '~/lib/blizzard/scheduler';

// Type-safe job registry
type JobRegistry = {
  'sync-character-profile': { characterId: number; region: string };
  'sync-character-quests':  { characterId: number; region: string };
  'sync-character-currencies': { characterId: number; region: string };
  'process-addon-upload':   { userId: number; upload: AddonUpload };
  'schedule-syncs': Record<string, never>;  // cron job, no payload
};

export default defineNitroPlugin(async (nitro) => {
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'pgboss',              // pg-boss owns this schema
  });

  await boss.start();

  // --- Register workers ---

  // Profile sync: up to 5 concurrent, matches Blizzard rate limits
  await boss.work<JobRegistry['sync-character-profile']>(
    'sync-character-profile',
    { teamSize: 5, teamConcurrency: 5 },
    async (job) => {
      await syncCharacterProfile(job.data.characterId, job.data.region);
    }
  );

  await boss.work<JobRegistry['sync-character-quests']>(
    'sync-character-quests',
    { teamSize: 5, teamConcurrency: 5 },
    async (job) => {
      await syncCharacterQuests(job.data.characterId, job.data.region);
    }
  );

  // Addon upload processing (one at a time to avoid conflicts)
  await boss.work<JobRegistry['process-addon-upload']>(
    'process-addon-upload',
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      await processAddonUpload(job.data.userId, job.data.upload);
    }
  );

  // --- Scheduled jobs (cron) ---

  // Every 60 seconds: check which characters need syncing and enqueue jobs
  await boss.schedule('schedule-syncs', '* * * * *'); // every minute
  await boss.work('schedule-syncs', async () => {
    await scheduleCharacterSyncs(boss);
  });

  // --- Cleanup on shutdown ---
  nitro.hooks.hook('close', async () => {
    await boss.stop({ graceful: true, timeout: 10_000 });
  });
});
```

```typescript
// src/lib/blizzard/scheduler.ts
import type PgBoss from 'pg-boss';
import { db } from '~/db';
import { syncState, characters } from '~/db/schema';
import { lt, asc, eq } from 'drizzle-orm';

export async function scheduleCharacterSyncs(boss: PgBoss) {
  // Find characters due for sync (next_sync_after < now, stalest first)
  const dueForSync = await db.select({
    characterId: syncState.characterId,
    syncType: syncState.syncType,
    region: characters.region,
  })
    .from(syncState)
    .innerJoin(characters, eq(syncState.characterId, characters.id))
    .where(lt(syncState.nextSyncAfter, new Date()))
    .orderBy(asc(syncState.lastSyncedAt))
    .limit(20);

  for (const row of dueForSync) {
    const jobName = `sync-character-${row.syncType}` as keyof JobRegistry;
    await boss.send(jobName, {
      characterId: row.characterId,
      region: row.region,
    }, {
      singletonKey: `${row.characterId}-${row.syncType}`, // prevent duplicate jobs
      retryLimit: 3,
      retryDelay: 60,   // 60s between retries
      expireInMinutes: 5,
    });
  }
}
```

Key pg-boss features we leverage:
- **`SKIP LOCKED`**: Multiple workers can poll the same queue without conflicts. Exactly-once delivery guaranteed by PostgreSQL.
- **`singletonKey`**: Prevents duplicate sync jobs for the same character+type combo. If a job is already queued, `send()` is a no-op.
- **`schedule()`**: Cron expressions stored in PostgreSQL. Survives server restarts - no lost schedules.
- **`retryLimit` + `retryDelay`**: Automatic retry with backoff for Blizzard API failures.
- **`teamSize` + `teamConcurrency`**: Controls parallelism per worker to respect API rate limits.

### Route Loaders

Each page loads its data via TanStack Router's `loader` + our server functions. Data is fetched on the server during SSR, then cached client-side via TanStack Query:

```typescript
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { getDashboardData } from '~/server/functions/activities';
import { Dashboard } from '~/components/dashboard/Dashboard';

export const Route = createFileRoute('/')({
  loader: () => getDashboardData(),
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData();
  return <Dashboard {...data} />;
}
```

---

## 10. Frontend Design

### Dashboard: The Single Most Important Page

The dashboard answers one question: **"What do I still need to do this week, across all my characters?"**

#### Layout (Desktop)

```
+-------------------------------------------------------------------+
|  WoWThing Lite          [Daily Reset: 4h 23m]  [Weekly: 2d 4h]    |
+-------------------------------------------------------------------+
|                                                                    |
|  +- Great Vault -------------------------------------------------+ |
|  |                                                                | |
|  |  Character      M+ (1/4/8)    Raid (2/4/6)   World (2/4/8)   | |
|  |  ---------      ----------    ------------    ------------     | |
|  |  Tharion 627    ooo.  +12    oo....  H      oooooooo T8       | |
|  |  Moonfire 621   o...  +10    ......  -      oo...... T6       | |
|  |  Stormaxe 615   ....  -      oooo..  N      ........ -        | |
|  |                                                                | |
|  +----------------------------------------------------------------+ |
|                                                                    |
|  +- Weekly Checklist ---------------------------------------------+ |
|  |                     Tharion    Moonfire    Stormaxe             | |
|  |  Unity Quest           [x]        [ ]        [ ]               | |
|  |  Special Assign 1      [x]        [x]        [ ]               | |
|  |  Special Assign 2      [ ]        [ ]        [ ]               | |
|  |  Dungeon Weekly         [x] (acct)                              | |
|  |  Prey (4 hunts)        3/4        0/4         1/4              | |
|  +----------------------------------------------------------------+ |
|                                                                    |
|  +- Dawncrests (Weekly Caps) ------------------------------------+ |
|  |                     Tharion    Moonfire    Stormaxe             | |
|  |  Adventurer         [=======] 100  [====..] 45  [==....] 22   | |
|  |  Veteran            [======.] 88   [===...] 30  [......] 0    | |
|  |  Champion           [====...] 42   [......] 0   [......] 0    | |
|  |  Hero               [=......] 15   [......] 0   [......] 0    | |
|  |  Myth               [......] 0     [......] 0   [......] 0    | |
|  +----------------------------------------------------------------+ |
|                                                                    |
|  +- Renown (Account-wide) ---------------------------------------+ |
|  |  Silvermoon Court    [============........]  12/20             | |
|  |  Amani Tribe         [=========...........]   9/20             | |
|  |  Hara'ti             [======..............]   6/20             | |
|  |  Singularity         [================....]  16/20             | |
|  +----------------------------------------------------------------+ |
|                                                                    |
|  +- Raid Lockouts -----------------------------------------------+ |
|  |                     Tharion    Moonfire    Stormaxe             | |
|  |  Voidspire (H)      4/6        -           -                  | |
|  |  Voidspire (N)       -         6/6         3/6                 | |
|  |  Dreamrift (H)      1/1        -           -                  | |
|  |  March on QD (N)     -         2/2          -                  | |
|  +----------------------------------------------------------------+ |
|                                                                    |
|  +- Daily Activities --------------------------------------------+ |
|  |  Bountiful Delves Today: Maisara Caverns, The Blinding Vale,  | |
|  |  Voidscar Arena, Den of Nalorakk                               | |
|  |  [Resets in 4h 23m]                                            | |
|  +----------------------------------------------------------------+ |
+--------------------------------------------------------------------+
```

#### Layout (Mobile)

On mobile, the grid collapses to **per-character cards** that expand/collapse:

```
+----------------------------+
|  WoWThing Lite             |
|  Weekly: 2d 4h  Daily: 4h  |
+----------------------------+
|                            |
|  v Tharion  627 ilvl       |
|  +----------------------+  |
|  | Vault: ooo. oo. o8   |  |
|  | Unity: [x]           |  |
|  | SA1: [x]  SA2: [ ]   |  |
|  | Dungeon: [x] (acct)  |  |
|  | Prey: 3/4            |  |
|  | Crests: A100 V88 C42 |  |
|  | Voidspire H: 4/6     |  |
|  +----------------------+  |
|                            |
|  > Moonfire  621 ilvl      |
|  > Stormaxe  615 ilvl      |
|                            |
|  +- Renown -------------+  |
|  | SC 12/20  AT 9/20    |  |
|  | Ha 6/20   Si 16/20   |  |
|  +----------------------+  |
+----------------------------+
```

### Component Architecture

```typescript
// src/components/dashboard/Dashboard.tsx
import { VaultSection } from './VaultSection';
import { WeeklyChecklist } from './WeeklyChecklist';
import { CrestTracker } from './CrestTracker';
import { RenownSection } from './RenownSection';
import { LockoutGrid } from './LockoutGrid';
import { DailySection } from './DailySection';
import type { DashboardData } from '~/server/functions/activities';

export function Dashboard({ characters, activities, renown, resetWeek }: DashboardData) {
  const weeklyActivities = activities.filter(a => a.category === 'weekly');
  const dailyActivities = activities.filter(a => a.category === 'daily');

  return (
    <div className="space-y-6">
      <VaultSection characters={characters} />
      <WeeklyChecklist characters={characters} activities={weeklyActivities} />
      <CrestTracker characters={characters} />
      <RenownSection renown={renown} />
      <LockoutGrid characters={characters} />
      <DailySection activities={dailyActivities} />
    </div>
  );
}
```

```typescript
// src/components/dashboard/VaultCard.tsx
import { cn } from '~/lib/utils';
import type { VaultSlot } from '~/db/types';

function VaultDots({ slots, thresholds }: { slots: VaultSlot[]; thresholds: number[] }) {
  return (
    <div className="flex gap-1">
      {thresholds.map((threshold, i) => {
        const slot = slots[i];
        const filled = slot && slot.progress >= slot.threshold;
        return (
          <div
            key={i}
            className={cn(
              'h-3 w-3 rounded-full border',
              filled ? 'bg-emerald-500 border-emerald-600' : 'bg-zinc-800 border-zinc-700'
            )}
            title={slot ? `${slot.progress}/${slot.threshold} - ilvl ${slot.itemLevel}` : 'Locked'}
          />
        );
      })}
    </div>
  );
}
```

### Data Refresh Strategy

TanStack Query handles all data freshness. No WebSockets, no SSE, no SignalR:

```typescript
// src/routes/index.tsx
export const Route = createFileRoute('/')({
  loader: () => getDashboardData(),
  staleTime: 60_000,     // Data considered fresh for 60s
  component: DashboardPage,
});
```

- **`staleTime: 60_000`**: Dashboard data refetches automatically after 60 seconds of staleness
- **Refetch on window focus**: TanStack Query refetches when the user tabs back in (default behavior)
- **Manual sync**: "Sync Now" button enqueues a pg-boss job via server function, then invalidates the query cache so the next refetch picks up new data
- **No push infrastructure** in v1. Background sync jobs write to PostgreSQL; the next TanStack Query refetch picks it up. For most users, data is at most 60s stale - perfectly acceptable for weekly/daily activity tracking.

Can add `LISTEN/NOTIFY` -> SSE push in a later phase if sub-second freshness becomes important.

### Color Coding System

| State | Tailwind Class | Meaning |
|-------|---------------|---------|
| Complete/capped | `bg-emerald-500/20 text-emerald-400` | Done for the week |
| In progress | `bg-amber-500/20 text-amber-400` | Partially complete |
| Urgent | `bg-red-500/20 text-red-400` | Not started, reset approaching (<6h) |
| Not started | `bg-zinc-800 text-zinc-400` | Not started, plenty of time |
| Account-wide done | `bg-blue-500/20 text-blue-400` | Complete for all characters |

### Class Colors

```typescript
// src/lib/wow/classes.ts
export const CLASS_COLORS = {
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
} as const;
```

---

## 11. Reset Timer System

### Region-Specific Reset Times

| Region | Daily Reset | Weekly Reset | Weekly Day |
|--------|------------|-------------|------------|
| US | 15:00 UTC | 15:00 UTC | Tuesday |
| EU | 07:00 UTC | 07:00 UTC | Wednesday |
| KR | 15:00 UTC | 15:00 UTC | Tuesday |
| TW | 15:00 UTC | 15:00 UTC | Tuesday |

### Server-Side Calculation

```typescript
// src/lib/activities/resets.ts
import type { Region } from '~/db/schema';

const RESET_CONFIG = {
  us: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },  // Tuesday
  eu: { dailyHour: 7,  weeklyDay: 3, weeklyHour: 7  },  // Wednesday
  kr: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
  tw: { dailyHour: 15, weeklyDay: 2, weeklyHour: 15 },
} as const;

export function getNextWeeklyReset(region: Region): Date {
  const config = RESET_CONFIG[region];
  const now = new Date();
  const reset = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    config.weeklyHour, 0, 0, 0
  ));

  // Advance to the correct weekday
  while (reset.getUTCDay() !== config.weeklyDay || reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset;
}

export function getNextDailyReset(region: Region): Date {
  const config = RESET_CONFIG[region];
  const now = new Date();
  const reset = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    config.dailyHour, 0, 0, 0
  ));

  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset;
}

export function getCurrentResetWeek(region: Region): string {
  const nextReset = getNextWeeklyReset(region);
  const weekStart = new Date(nextReset.getTime() - 7 * 24 * 60 * 60 * 1000);
  // ISO week calculation
  const jan4 = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 4));
  const dayDiff = (weekStart.getTime() - jan4.getTime()) / 86400000;
  const week = Math.ceil((dayDiff + jan4.getUTCDay() + 1) / 7);
  return `${weekStart.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
```

### Client-Side Countdown Hook

```typescript
// src/hooks/useResetTimer.ts
import { useState, useEffect } from 'react';

export function useResetTimer(resetTime: Date | string) {
  const target = typeof resetTime === 'string' ? new Date(resetTime) : resetTime;
  const [timeRemaining, setTimeRemaining] = useState(() => formatDiff(target.getTime() - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setTimeRemaining('Reset!');
        clearInterval(interval);
        // Could trigger a router invalidation here
        return;
      }
      setTimeRemaining(formatDiff(diff));
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return timeRemaining;
}

function formatDiff(ms: number): string {
  if (ms <= 0) return 'Reset!';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
```

The reset timestamps are injected during SSR and hydrated on the client. No server round-trips for countdown updates.

---

## 12. Activity Definitions

Activities are seeded from YAML and stored in the database:

```yaml
# seeds/activities.yaml
expansion: 11
patch: "12.0.0"

activities:
  # === WEEKLY ===
  - key: unity_quest
    name: Unity
    short_name: Unity
    category: weekly
    reset_type: weekly
    description: "Complete one of the rotating Midnight weekly quests"
    quest_ids: [93890, 93767, 94457, 93909, 93911, 93769, 93891, 93910, 93912, 93889, 93892, 93913, 93766]
    threshold: 1
    metadata:
      min_level: 90

  - key: hope_quest
    name: Hope in the Darkest Corners
    short_name: Hope
    category: weekly
    reset_type: weekly
    quest_ids: [95468]
    threshold: 1
    metadata:
      min_level: 80
      max_level: 89

  - key: special_assignment_1
    name: Special Assignment 1
    short_name: SA1
    category: weekly
    reset_type: weekly
    quest_ids: [91390, 91796, 92063, 92139, 92145, 93013, 93244, 93438]
    threshold: 1
    metadata:
      unlock_quest_ids: [94865, 94866, 94390, 95435, 92848, 94391, 94795, 94743]

  - key: special_assignment_2
    name: Special Assignment 2
    short_name: SA2
    category: weekly
    reset_type: weekly
    quest_ids: [91390, 91796, 92063, 92139, 92145, 93013, 93244, 93438]
    threshold: 1
    metadata:
      unlock_quest_ids: [94865, 94866, 94390, 95435, 92848, 94391, 94795, 94743]
      slot: 2

  - key: dungeon_weekly
    name: Dungeon Weekly
    short_name: Dungeon
    category: weekly
    reset_type: weekly
    description: "Complete the specified dungeon (Halduron Brightwing quest)"
    quest_ids: [93751, 93752, 93753, 93754, 93755, 93756, 93757, 93758]
    threshold: 1
    account_wide: true

  - key: prey_hunts
    name: Prey Hunts
    short_name: Prey
    category: weekly
    reset_type: weekly
    description: "Complete 4 hunts for maximum efficiency"
    threshold: 4
    metadata:
      track_count: true

  - key: vault_mythic_plus
    name: "Great Vault: Mythic+"
    short_name: "Vault M+"
    category: weekly
    reset_type: weekly
    metadata:
      source: vault_api
      thresholds: [1, 4, 8]

  - key: vault_raid
    name: "Great Vault: Raid"
    short_name: "Vault Raid"
    category: weekly
    reset_type: weekly
    metadata:
      source: vault_api
      thresholds: [2, 4, 6]

  - key: vault_world
    name: "Great Vault: World"
    short_name: "Vault World"
    category: weekly
    reset_type: weekly
    metadata:
      source: vault_api
      thresholds: [2, 4, 8]

  # === CURRENCIES (weekly-capped) ===
  - key: dawncrest_adventurer
    name: Adventurer Dawncrest
    short_name: Adv
    category: weekly
    reset_type: weekly
    metadata: { source: currency_api, currency_id: 3383, weekly_cap: 100 }

  - key: dawncrest_veteran
    name: Veteran Dawncrest
    short_name: Vet
    category: weekly
    reset_type: weekly
    metadata: { source: currency_api, currency_id: 3341, weekly_cap: 100 }

  - key: dawncrest_champion
    name: Champion Dawncrest
    short_name: Champ
    category: weekly
    reset_type: weekly
    metadata: { source: currency_api, currency_id: 3343, weekly_cap: 100 }

  - key: dawncrest_hero
    name: Hero Dawncrest
    short_name: Hero
    category: weekly
    reset_type: weekly
    metadata: { source: currency_api, currency_id: 3345, weekly_cap: 100 }

  - key: dawncrest_myth
    name: Myth Dawncrest
    short_name: Myth
    category: weekly
    reset_type: weekly
    metadata: { source: currency_api, currency_id: 3348, weekly_cap: 100 }

  # === DAILY ===
  - key: bountiful_delves
    name: Bountiful Delves
    short_name: Bountiful
    category: daily
    reset_type: daily
    description: "Complete bountiful delves (4 available daily)"
    metadata: { track_count: true, daily_limit: 4 }

  # === RAID LOCKOUTS ===
  - key: lockout_voidspire
    name: Voidspire
    category: weekly
    reset_type: weekly
    metadata: { source: lockout_api, instance_id: 16340, boss_count: 6, difficulties: [normal, heroic, mythic] }

  - key: lockout_dreamrift
    name: Dreamrift
    category: weekly
    reset_type: weekly
    metadata: { source: lockout_api, instance_id: 16531, boss_count: 1, difficulties: [normal, heroic, mythic] }

  - key: lockout_quel_danas
    name: "March on Quel'Danes"
    category: weekly
    reset_type: weekly
    metadata: { source: lockout_api, instance_id: 16215, boss_count: 2, difficulties: [normal, heroic, mythic] }

# === RENOWN FACTIONS ===
renown:
  - name: Silvermoon Court
    zone: Eversong Woods
    max_level: 20
  - name: Amani Tribe
    zone: Zul'Aman
    max_level: 20
  - name: Hara'ti
    zone: Harandar
    max_level: 20
  - name: Singularity
    zone: Voidstorm
    max_level: 20
```

### Why YAML + Database Instead of Code?

WoWThing defines activities in TypeScript with complex dynamic functions:

```typescript
// WoWThing: deeply coupled to frontend code
questIds: (char) => {
    if (char.level < Constants.characterMaxLevel) {
        return [85947, 85948];
    } else {
        return [83274, 83363];
    }
}
```

Our approach:
- Activity definitions are **data**, not **code**
- Stored in the database after seeding from YAML
- The `metadata` JSONB field handles edge cases (min_level, unlock quests, etc.)
- Dynamic logic (like "which special assignment is active") lives in the **server function layer**, not in UI components
- Adding patch 12.0.5 activities = new YAML entries + `bun db:seed`, no code deploy needed

---

## 13. Authentication Flow

```
+-----------+     +------------------+     +-----------------+
|  Browser  |---->|  TanStack Start  |---->|  Battle.net     |
|           |     |  Server Route    |     |  OAuth2         |
| 1. Click  |     |                  |     |                 |
|   Login   |     | 2. Redirect to   |     | 3. User         |
|           |<----|    Battle.net    |<----|   authorizes    |
|           |     |                  |     | 4. Callback     |
| 6. See    |     | 5. Exchange code |     |   with code     |
|  dashboard|     |   Set session    |     |                 |
+-----------+     +------------------+     +-----------------+
```

### Auth Server Routes

```typescript
// src/routes/auth/login.ts
import { createServerFileRoute } from '@tanstack/react-start/server';
import { getBattleNetAuthUrl } from '~/lib/auth/battlenet';

export const ServerRoute = createServerFileRoute('/auth/login')({
  GET: async ({ request }) => {
    const { url, state } = getBattleNetAuthUrl();
    // Store state in cookie for CSRF verification
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      },
    });
  },
});

// src/routes/auth/callback.ts
import { createServerFileRoute } from '@tanstack/react-start/server';
import { exchangeCode, fetchUserProfile } from '~/lib/auth/battlenet';
import { createSession } from '~/lib/auth/session';
import { db } from '~/db';
import { users } from '~/db/schema';

export const ServerRoute = createServerFileRoute('/auth/callback')({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    // Verify state, exchange code, upsert user, create session...
    const tokens = await exchangeCode(code);
    const profile = await fetchUserProfile(tokens.accessToken);
    const user = await upsertUser(profile, tokens);
    const sessionCookie = await createSession(user.id);

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': sessionCookie,
      },
    });
  },
});
```

### Auth Middleware for Server Functions

```typescript
// src/lib/auth/middleware.ts
import { createMiddleware } from '@tanstack/react-start';
import { getSession } from './session';

export const authMiddleware = createMiddleware({ type: 'function' })
  .handler(async ({ next }) => {
    const session = await getSession();
    if (!session) {
      throw new Response(null, { status: 302, headers: { Location: '/auth/login' } });
    }
    return next({ context: { session } });
  });
```

### Security

- Cookie-based sessions with `HttpOnly`, `Secure`, `SameSite=Lax`
- Session data stored in PostgreSQL `sessions` table (not in-memory - survives restarts)
- OAuth state parameter to prevent CSRF on login flow
- Access tokens encrypted with AES-256-GCM before database storage
- Auth middleware on all server functions that touch user data
- No sensitive data in client-side bundles
- Expired sessions cleaned up by a pg-boss cron job (`session-cleanup`, daily)

---

## 14. Deployment

### Development

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
      BATTLENET_REDIRECT_URI: http://localhost:3000/auth/callback
      SESSION_SECRET: dev-secret-change-in-production
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

Two services vs WoWThing's five. Or just run postgres locally and `bun dev`.

### Production

```dockerfile
# Dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
```

Deployment targets:
- **Fly.io** or **Railway**: Single machine + managed Postgres
- **VPS**: Docker container + Postgres
- **Cloudflare Workers**: TanStack Start has first-class support (would need D1 or Turso instead of Postgres)

### Environment Variables

```
DATABASE_URL=postgres://...
BATTLENET_CLIENT_ID=...
BATTLENET_CLIENT_SECRET=...
BATTLENET_REDIRECT_URI=https://your-domain/auth/callback
SESSION_SECRET=<random 32+ bytes>
ENCRYPTION_KEY=<random 32 bytes, for token encryption>
PORT=3000
```

---

## 15. Extension Path (Toward Full WoWThing)

The architecture supports incremental additions without restructuring:

### Phase 2: More Activity Types
- Add profession chores, PvP weeklies, holiday/event tracking
- **How**: New seed YAML entries, new sync logic in `lib/blizzard/`, new UI sections

### Phase 3: Collections
- Mounts, pets, toys, transmog tracking
- **How**: New Drizzle tables, new Blizzard API endpoints in sync worker, new route + page

### Phase 4: Historic Expansions
- Add The War Within, Dragonflight activities
- **How**: New seed files with `expansion_id: 10`, `9`. Activity definitions are already expansion-scoped. Add an expansion picker to the UI.

### Phase 5: Auction House
- Commodity price tracking
- **How**: New tables (potentially partitioned). New pg-boss job type on a longer cron schedule.

### Phase 6: Real-time Push Updates
- Instant dashboard refresh when sync completes instead of polling
- **How**: Add PG `LISTEN/NOTIFY` -> SSE bridge. pg-boss workers call `pg_notify()` on completion. Client `EventSource` invalidates TanStack Query cache. All infrastructure already in PostgreSQL - just needs a Nitro plugin and a server route.

### Phase 7: Public Profiles / Social
- Shareable profiles, guild tracking
- **How**: Public routes without auth middleware, guild sync, sharing tokens.

### Migration Complexity Estimate

| Phase | New Tables | New Blizzard APIs | Effort |
|-------|-----------|-------------------|--------|
| 2 | 0 (reuse existing) | 0-2 new sync job types | Small |
| 3 | 1-3 | 3-5 | Medium |
| 4 | 0 (just seed data) | 0 | Small |
| 5 | 2-3 | 1 (high volume) | Large |
| 6 | 0 | 0 (PG LISTEN/NOTIFY + SSE) | Small |
| 7 | 2-3 | 3-5 new pages | Medium |

---

## 16. Resolved Decisions & Remaining Questions

### Resolved

| Decision | Resolution |
|----------|-----------|
| **Auth** | Better Auth with TanStack Start integration, Battle.net as custom OAuth2 provider |
| **Framework commitment** | Full commit to TanStack Start (RC). Accept RC risk for the DX benefits. |
| **pg-boss deployment** | In-process (same Nitro server process). Keep things together. |
| **pg-boss schema** | `drizzle-kit` configured to ignore `pgboss` schema. pg-boss owns its tables. |
| **Lua parser** | Port WoWThing's `LuaToJsonConverter4` directly to TypeScript. Stay in sync with upstream. |
| **Currency IDs** | Adventurer=3383, Veteran=3341, Champion=3343, Hero=3345, Myth=3348, Voidlight Marl=3316, Resonance Crystals=2815 |
| **Raid instance IDs** | Voidspire=16340, Dreamrift=16531, March on Quel'Danes=16215 |
| **Multi-user** | Yes, multi-user from the start. Schema already supports it. |
| **Character filtering** | No filters for now. Default sort by level descending. |
| **Historical data** | Store historical weekly snapshots. No UI for viewing history yet. |
| **UI library** | @fx/ui (React 19 + Base UI + Tailwind v4 + CVA). Fallback to shadcn + Base UI for missing components. Install: `bun add @fx/ui` |
| **Dark/light mode** | @fx/ui provides a theme toggle out of the box. Ship with both. |
| **Package manager** | Bun |

### Remaining Open Questions

#### Game Data
1. **Prey hunt quest IDs**: Need to confirm which quest IDs from the addon map to hunt completions (Normal/Hard/Nightmare difficulties).
2. **Bountiful Delve rotation**: Is the daily rotation deterministic (can we calculate it) or does the addon just tell us what's available?

---

## Appendix A: WoWThing Architecture Reference

For context, here's what we're simplifying from:

### WoWThing Service Count
| Service | Technology | Purpose |
|---------|-----------|---------|
| Backend | .NET Worker Service | Job processing (100+ job types) |
| Web | ASP.NET Core | API server + page rendering |
| Frontend | Svelte 5 + Vite | SPA client |
| PostgreSQL | Database | 90+ tables |
| Redis | Cache | Session, sync state, change notifications |

### WoWThing Key File Counts
| Category | Files | Lines (approx) |
|----------|-------|----------------|
| Backend jobs | 40+ | 5,000+ |
| Database models | 45+ | 3,000+ |
| Frontend components | 100+ | 15,000+ |
| Frontend types | 30+ | 5,000+ |
| Task/chore definitions | 38 files | 3,000+ |
| Database migrations | 50+ | - |
| **Total** | **~300+** | **~30,000+** |

### Our Target
| Category | Files | Lines (approx) |
|----------|-------|----------------|
| Routes + pages | 6-8 | 400 |
| Components | 15-20 | 1,200 |
| Server functions | 4-6 | 400 |
| DB schema + queries | 4-5 | 300 |
| Blizzard API client + sync | 5-8 | 600 |
| Auth | 3-4 | 250 |
| Hooks + utilities | 5-8 | 300 |
| Config + seeds | 3-4 | 300 |
| **Total** | **~50-65** | **~3,750** |

An 8x reduction in complexity while covering the most-used feature (weekly/daily activity tracking) for the current expansion.

---

## Appendix B: Midnight Quest ID Reference

Sourced from WoWThing's existing `11-midnight/12-0-0.ts`:

### Unity Quest Options (one per week, rotating)
| Quest ID | Activity |
|----------|----------|
| 93890 | Midnight: Abundance |
| 93767 | Midnight: Arcantina |
| 94457 | Midnight: Battlegrounds |
| 93909 | Midnight: Delves |
| 93911 | Midnight: Dungeons |
| 93769 | Midnight: Housing |
| 93891 | Midnight: Legends of the Haranir |
| 93910 | Midnight: Prey |
| 93912 | Midnight: Raid |
| 93889 | Midnight: Saltheril's Soiree |
| 93892 | Midnight: Stormarion Assault |
| 93913 | Midnight: World Boss |
| 93766 | Midnight: World Quests |

### Special Assignment Unlock Quests -> Assignment Quests
| Unlock ID | Assignment ID | Name |
|-----------|--------------|------|
| 94865 | 91390 | What Remains of a Temple Broken |
| 94866 | 91796 | Ours Once More! |
| 94390 | 92063 | A Hunter's Regret |
| 95435 | 92139 | Shade and Claw |
| 92848 | 92145 | The Grand Magister's Drink |
| 94391 | 93013 | Push Back the Light |
| 94795 | 93244 | Agents of the Shield |
| 94743 | 93438 | Precision Excision |

### Dungeon Weekly Quests (Account-wide)
| Quest ID | Dungeon |
|----------|---------|
| 93751 | Windrunner Spire |
| 93752 | Murder Row |
| 93753 | Magisters' Terrace |
| 93754 | Maisara Caverns |
| 93755 | Den of Nalorakk |
| 93756 | The Blinding Vale |
| 93757 | Voidscar Arena |
| 93758 | Nexus-Point Xenas |

### Hope Quest (Leveling Characters)
| Quest ID | Name | Level Range |
|----------|------|-------------|
| 95468 | Hope in the Darkest Corners | 80-89 |
