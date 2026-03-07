ALTER TABLE "users" ADD COLUMN "better_auth_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_better_auth_user_id_unique" UNIQUE("better_auth_user_id");