CREATE TABLE "coffee_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coffees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"roaster_id" uuid,
	"roast_level_id" uuid,
	"roastDate" date,
	"country_id" uuid,
	"region_id" uuid,
	"process_id" uuid,
	"notes" text,
	"is_active" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coffees_varieties" (
	"variety_id" uuid,
	"coffee_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "coffees_varieties_pkey" PRIMARY KEY("coffee_id","variety_id")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "espresso_shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"coffee_id" uuid NOT NULL,
	"dose" numeric,
	"yield" numeric,
	"time" integer,
	"grind_setting" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"region_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "green_coffees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"country_id" uuid,
	"region_id" uuid,
	"farm_id" uuid,
	"process_id" uuid,
	"altitude" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "green_coffees_varieties" (
	"variety_id" uuid,
	"green_coffee_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "green_coffees_varieties_pkey" PRIMARY KEY("green_coffee_id","variety_id")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"country_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "roast_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "roasters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coffee_processes_name_idx" ON "coffee_processes" ("name");--> statement-breakpoint
CREATE INDEX "coffees_user_idx" ON "coffees" ("user_id");--> statement-breakpoint
CREATE INDEX "coffees_user_name_idx" ON "coffees" ("name","user_id");--> statement-breakpoint
CREATE INDEX "coffees_user_process_id_idx" ON "coffees" ("process_id","user_id");--> statement-breakpoint
CREATE INDEX "coffees_user_country_idx" ON "coffees" ("country_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "countries_name_idx" ON "countries" ("name");--> statement-breakpoint
CREATE INDEX "espresso_shots_user_idx" ON "espresso_shots" ("user_id");--> statement-breakpoint
CREATE INDEX "espresso_shots_user_coffee_idx" ON "espresso_shots" ("user_id","coffee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "farms_name_region_idx" ON "farms" ("name","region_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_idx" ON "green_coffees" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "green_coffees_user_name_idx" ON "green_coffees" ("name","user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_process_id_idx" ON "green_coffees" ("process_id","user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_country_idx" ON "green_coffees" ("country_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regions_name_country_idx" ON "regions" ("name","country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roast_levels_name_idx" ON "roast_levels" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "roasters_name_idx" ON "roasters" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "varieties_name_idx" ON "varieties" ("name");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "coffee_processes" ADD CONSTRAINT "coffee_processes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_roaster_id_roasters_id_fkey" FOREIGN KEY ("roaster_id") REFERENCES "roasters"("id");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_roast_level_id_roast_levels_id_fkey" FOREIGN KEY ("roast_level_id") REFERENCES "roast_levels"("id");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_process_id_coffee_processes_id_fkey" FOREIGN KEY ("process_id") REFERENCES "coffee_processes"("id");--> statement-breakpoint
ALTER TABLE "coffees_varieties" ADD CONSTRAINT "coffees_varieties_variety_id_varieties_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "varieties"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "coffees_varieties" ADD CONSTRAINT "coffees_varieties_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id");--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id");--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id");--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_farm_id_farms_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id");--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_process_id_coffee_processes_id_fkey" FOREIGN KEY ("process_id") REFERENCES "coffee_processes"("id");--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ADD CONSTRAINT "green_coffees_varieties_variety_id_varieties_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "varieties"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ADD CONSTRAINT "green_coffees_varieties_green_coffee_id_green_coffees_id_fkey" FOREIGN KEY ("green_coffee_id") REFERENCES "green_coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id");--> statement-breakpoint
ALTER TABLE "roast_levels" ADD CONSTRAINT "roast_levels_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roasters" ADD CONSTRAINT "roasters_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;