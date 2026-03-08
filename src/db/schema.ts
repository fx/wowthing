import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { Lockout, VaultSlot } from './types';

const tz = { withTimezone: true } as const;

// ==========================================
// Better Auth tables (managed by better-auth)
// ==========================================

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', tz).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', tz),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', tz),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', tz).notNull(),
  createdAt: timestamp('created_at', tz).defaultNow(),
  updatedAt: timestamp('updated_at', tz).defaultNow(),
});

// ==========================================
// Application tables
// ==========================================

// === Users ===
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  betterAuthUserId: text('better_auth_user_id').unique(),
  battleNetId: integer('battle_net_id').notNull().unique(),
  battleTag: text('battle_tag').notNull(),
  accessToken: text('access_token').notNull(), // AES-256-GCM encrypted
  refreshToken: text('refresh_token'), // AES-256-GCM encrypted
  tokenExpiresAt: timestamp('token_expires_at', tz).notNull(),
  region: text('region').notNull(), // 'us' | 'eu' | 'kr' | 'tw'
  createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
});

// === Accounts ===
export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    battleNetAccountId: integer('battle_net_account_id').notNull(),
    region: text('region').notNull(),
    displayName: text('display_name'),
  },
  (t) => [index('idx_accounts_user').on(t.userId)],
);

// === Characters ===
export const characters = pgTable(
  'characters',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    blizzardId: integer('blizzard_id').notNull(),
    name: text('name').notNull(),
    realmSlug: text('realm_slug').notNull(),
    classId: integer('class_id').notNull(),
    raceId: integer('race_id').notNull(),
    faction: text('faction').notNull(), // 'alliance' | 'horde'
    level: integer('level').notNull(),
    itemLevel: integer('item_level'),
    lastApiSyncAt: timestamp('last_api_sync_at', tz),
    lastApiModified: text('last_api_modified'),
    updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
  },
  (t) => [index('idx_characters_account').on(t.accountId)],
);

// === Weekly Activity Snapshots ===
export const weeklyActivities = pgTable(
  'weekly_activities',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    resetWeek: text('reset_week').notNull(), // "2026-W10"
    vaultDungeonProgress: jsonb('vault_dungeon_progress').$type<VaultSlot[]>(),
    vaultRaidProgress: jsonb('vault_raid_progress').$type<VaultSlot[]>(),
    vaultWorldProgress: jsonb('vault_world_progress').$type<VaultSlot[]>(),
    vaultHasRewards: boolean('vault_has_rewards').notNull().default(false),
    keystoneDungeonId: integer('keystone_dungeon_id'),
    keystoneLevel: integer('keystone_level'),
    lockouts: jsonb('lockouts').$type<Lockout[]>(),
    delvesGilded: integer('delves_gilded'),
    syncedAt: timestamp('synced_at', tz),
    createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_weekly_char_week').on(t.characterId, t.resetWeek)],
);

// === Quest Completions ===
export const questCompletions = pgTable(
  'quest_completions',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    questId: integer('quest_id').notNull(),
    resetType: text('reset_type').notNull(), // 'daily' | 'weekly'
    resetWeek: text('reset_week'),
    resetDate: text('reset_date'), // YYYY-MM-DD
    completedAt: timestamp('completed_at', tz).defaultNow().notNull(),
  },
  (t) => [
    index('idx_quests_char_quest_week').on(
      t.characterId,
      t.questId,
      t.resetWeek,
    ),
    index('idx_quests_char_quest_date').on(
      t.characterId,
      t.questId,
      t.resetDate,
    ),
  ],
);

// === Currencies ===
export const currencies = pgTable(
  'currencies',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    currencyId: integer('currency_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
    maxQuantity: integer('max_quantity'),
    weekQuantity: integer('week_quantity'),
    weekMax: integer('week_max'),
    updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_currencies_char_currency').on(t.characterId, t.currencyId),
  ],
);

// === Renown (account-wide) ===
export const renown = pgTable(
  'renown',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    factionId: integer('faction_id').notNull(),
    renownLevel: integer('renown_level').notNull().default(0),
    reputationCurrent: integer('reputation_current').notNull().default(0),
    reputationMax: integer('reputation_max').notNull().default(2500),
    updatedAt: timestamp('updated_at', tz).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_renown_user_faction').on(t.userId, t.factionId)],
);

// === Activity Definitions (seeded) ===
export const activityDefinitions = pgTable(
  'activity_definitions',
  {
    id: serial('id').primaryKey(),
    expansionId: integer('expansion_id').notNull(), // 11 = Midnight
    patch: text('patch').notNull(), // "12.0.0"
    category: text('category').notNull(), // 'weekly' | 'daily'
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    description: text('description'),
    resetType: text('reset_type').notNull(), // 'daily' | 'weekly' | 'biweekly'
    questIds: integer('quest_ids').array(),
    threshold: integer('threshold'),
    accountWide: boolean('account_wide').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    metadata: jsonb('metadata'),
  },
  (t) => [index('idx_activity_defs_expansion').on(t.expansionId, t.category)],
);

// === Sessions ===
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', tz).notNull(),
    createdAt: timestamp('created_at', tz).defaultNow().notNull(),
  },
  (t) => [
    index('idx_sessions_user').on(t.userId),
    index('idx_sessions_expires').on(t.expiresAt),
  ],
);

// === Sync State ===
export const syncState = pgTable(
  'sync_state',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    syncType: text('sync_type').notNull(),
    lastSyncedAt: timestamp('last_synced_at', tz),
    lastModifiedHeader: text('last_modified_header'),
    nextSyncAfter: timestamp('next_sync_after', tz),
    errorCount: integer('error_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('idx_sync_char_type').on(t.characterId, t.syncType),
    index('idx_sync_next').on(t.nextSyncAfter),
  ],
);

// === Addon Uploads ===
export const addonUploads = pgTable(
  'addon_uploads',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rawLua: text('raw_lua').notNull(),
    byteSize: integer('byte_size').notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'processed' | 'failed'
    errorMessage: text('error_message'),
    characterCount: integer('character_count'),
    createdAt: timestamp('created_at', tz).defaultNow().notNull(),
    processedAt: timestamp('processed_at', tz),
  },
  (t) => [index('idx_addon_uploads_user').on(t.userId)],
);

// === Relations ===
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  renown: many(renown),
  addonUploads: many(addonUploads),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  characters: many(characters),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(accounts, {
    fields: [characters.accountId],
    references: [accounts.id],
  }),
  weeklyActivities: many(weeklyActivities),
  questCompletions: many(questCompletions),
  currencies: many(currencies),
}));

export const weeklyActivitiesRelations = relations(
  weeklyActivities,
  ({ one }) => ({
    character: one(characters, {
      fields: [weeklyActivities.characterId],
      references: [characters.id],
    }),
  }),
);

export const questCompletionsRelations = relations(
  questCompletions,
  ({ one }) => ({
    character: one(characters, {
      fields: [questCompletions.characterId],
      references: [characters.id],
    }),
  }),
);

export const currenciesRelations = relations(currencies, ({ one }) => ({
  character: one(characters, {
    fields: [currencies.characterId],
    references: [characters.id],
  }),
}));

export const addonUploadsRelations = relations(addonUploads, ({ one }) => ({
  user: one(users, {
    fields: [addonUploads.userId],
    references: [users.id],
  }),
}));
