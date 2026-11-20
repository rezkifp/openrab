CREATE SCHEMA IF NOT EXISTS "openrab";
--> statement-breakpoint
CREATE TYPE "openrab"."project_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "openrab"."resource_type" AS ENUM('MATERIAL', 'LABOR', 'EQUIPMENT');--> statement-breakpoint
CREATE TABLE "openrab"."ahsp_compositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ahsp_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"coefficient" numeric(10, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."master_ahsp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_ahsp_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "openrab"."master_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "openrab"."resource_type" NOT NULL,
	"unit" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_resources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "openrab"."project_takeoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wbs_id" uuid NOT NULL,
	"ahsp_id" uuid NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"length" numeric(12, 4),
	"width" numeric(12, 4),
	"height" numeric(12, 4),
	"count" integer,
	"deduction_volume" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"calculated_volume" numeric(12, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."project_wbs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region_id" uuid NOT NULL,
	"status" "openrab"."project_status" DEFAULT 'DRAFT' NOT NULL,
	"price_date" date DEFAULT now() NOT NULL,
	"overhead_profit_margin" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"tax_rate_ppn" numeric(5, 2) DEFAULT '11.00' NOT NULL,
	"region_name_frozen" text,
	"finalized_at" timestamp with time zone,
	"source_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."resource_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"base_price" numeric(15, 2) NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openrab"."takeoff_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"takeoff_id" uuid NOT NULL,
	"wbs_path" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL,
	"volume" numeric(12, 4) NOT NULL,
	"ahsp_code" text NOT NULL,
	"ahsp_name" text NOT NULL,
	"ahsp_unit" text NOT NULL,
	"resource_code" text NOT NULL,
	"resource_name" text NOT NULL,
	"resource_unit" text NOT NULL,
	"resource_type" "openrab"."resource_type" NOT NULL,
	"coefficient" numeric(10, 4) NOT NULL,
	"frozen_price" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "openrab"."ahsp_compositions" ADD CONSTRAINT "ahsp_compositions_ahsp_id_master_ahsp_id_fk" FOREIGN KEY ("ahsp_id") REFERENCES "openrab"."master_ahsp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."ahsp_compositions" ADD CONSTRAINT "ahsp_compositions_resource_id_master_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "openrab"."master_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."project_takeoffs" ADD CONSTRAINT "project_takeoffs_wbs_id_project_wbs_id_fk" FOREIGN KEY ("wbs_id") REFERENCES "openrab"."project_wbs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."project_takeoffs" ADD CONSTRAINT "project_takeoffs_ahsp_id_master_ahsp_id_fk" FOREIGN KEY ("ahsp_id") REFERENCES "openrab"."master_ahsp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."project_wbs" ADD CONSTRAINT "project_wbs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "openrab"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."project_wbs" ADD CONSTRAINT "project_wbs_parent_id_project_wbs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "openrab"."project_wbs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."projects" ADD CONSTRAINT "projects_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "openrab"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."resource_prices" ADD CONSTRAINT "resource_prices_resource_id_master_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "openrab"."master_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."resource_prices" ADD CONSTRAINT "resource_prices_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "openrab"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openrab"."takeoff_snapshots" ADD CONSTRAINT "takeoff_snapshots_takeoff_id_project_takeoffs_id_fk" FOREIGN KEY ("takeoff_id") REFERENCES "openrab"."project_takeoffs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ahsp_compositions_ahsp_res_idx" ON "openrab"."ahsp_compositions" USING btree ("ahsp_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_prices_res_reg_date_idx" ON "openrab"."resource_prices" USING btree ("resource_id","region_id","effective_date");