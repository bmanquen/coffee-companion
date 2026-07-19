CREATE TYPE "brew_environment" AS ENUM('Counter', 'Fridge');--> statement-breakpoint
CREATE TABLE "cold_brew_brews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"coffee_id" uuid NOT NULL,
	"roast_date" date,
	"grinder_id" uuid NOT NULL,
	"brewing_device_id" uuid NOT NULL,
	"grind_setting" text,
	"notes" text,
	"is_dialed_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"dose" numeric,
	"water" numeric,
	"steep_time" integer,
	"brew_environment" "brew_environment"
);
--> statement-breakpoint
CREATE INDEX "cold_brew_brews_user_idx" ON "cold_brew_brews" ("user_id");--> statement-breakpoint
CREATE INDEX "cold_brew_brews_user_coffee_idx" ON "cold_brew_brews" ("user_id","coffee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cold_brew_brews_dialed_in_idx" ON "cold_brew_brews" ("coffee_id") WHERE is_dialed_in;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_grinder_id_grinders_id_fkey" FOREIGN KEY ("grinder_id") REFERENCES "grinders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_brewing_device_id_brewing_devices_id_fkey" FOREIGN KEY ("brewing_device_id") REFERENCES "brewing_devices"("id") ON DELETE CASCADE;