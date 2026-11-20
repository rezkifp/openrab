ALTER TABLE "openrab"."project_takeoffs" ADD COLUMN "sub_items_json" text;--> statement-breakpoint
ALTER TABLE "openrab"."projects" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "openrab"."projects" ADD COLUMN "project_location" text;--> statement-breakpoint
ALTER TABLE "openrab"."projects" ADD COLUMN "architect_name" text;--> statement-breakpoint
ALTER TABLE "openrab"."projects" ADD COLUMN "building_area_m2" numeric(12, 2);