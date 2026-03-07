CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"battle_net_account_id" integer NOT NULL,
	"region" text NOT NULL,
	"display_name" text
);
--> statement-breakpoint
CREATE TABLE "activity_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"expansion_id" integer NOT NULL,
	"patch" text NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description" text,
	"reset_type" text NOT NULL,
	"quest_ids" integer[],
	"threshold" integer,
	"account_wide" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true,
	"metadata" jsonb,
	CONSTRAINT "activity_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"blizzard_id" integer NOT NULL,
	"name" text NOT NULL,
	"realm_slug" text NOT NULL,
	"class_id" integer NOT NULL,
	"race_id" integer NOT NULL,
	"faction" text NOT NULL,
	"level" integer NOT NULL,
	"item_level" integer,
	"last_api_sync_at" timestamp,
	"last_api_modified" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"currency_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"max_quantity" integer,
	"week_quantity" integer,
	"week_max" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"reset_type" text NOT NULL,
	"reset_week" text,
	"reset_date" text,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renown" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"faction_id" integer NOT NULL,
	"renown_level" integer DEFAULT 0 NOT NULL,
	"reputation_current" integer DEFAULT 0 NOT NULL,
	"reputation_max" integer DEFAULT 2500 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"sync_type" text NOT NULL,
	"last_synced_at" timestamp,
	"last_modified_header" text,
	"next_sync_after" timestamp,
	"error_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"battle_net_id" integer NOT NULL,
	"battle_tag" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_battle_net_id_unique" UNIQUE("battle_net_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"reset_week" text NOT NULL,
	"vault_dungeon_progress" jsonb,
	"vault_raid_progress" jsonb,
	"vault_world_progress" jsonb,
	"vault_has_rewards" boolean DEFAULT false,
	"keystone_dungeon_id" integer,
	"keystone_level" integer,
	"lockouts" jsonb,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renown" ADD CONSTRAINT "renown_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_activities" ADD CONSTRAINT "weekly_activities_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_defs_expansion" ON "activity_definitions" USING btree ("expansion_id","category");--> statement-breakpoint
CREATE INDEX "idx_characters_account" ON "characters" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_currencies_char_currency" ON "currencies" USING btree ("character_id","currency_id");--> statement-breakpoint
CREATE INDEX "idx_quests_char_quest_week" ON "quest_completions" USING btree ("character_id","quest_id","reset_week");--> statement-breakpoint
CREATE INDEX "idx_quests_char_quest_date" ON "quest_completions" USING btree ("character_id","quest_id","reset_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_renown_user_faction" ON "renown" USING btree ("user_id","faction_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sync_char_type" ON "sync_state" USING btree ("character_id","sync_type");--> statement-breakpoint
CREATE INDEX "idx_sync_next" ON "sync_state" USING btree ("next_sync_after");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_weekly_char_week" ON "weekly_activities" USING btree ("character_id","reset_week");