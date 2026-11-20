ALTER TABLE "openrab"."project_wbs" ADD COLUMN IF NOT EXISTS "start_week" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "openrab"."project_wbs" ADD COLUMN IF NOT EXISTS "duration_weeks" integer DEFAULT 1 NOT NULL;
