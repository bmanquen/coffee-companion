CREATE TABLE "frenchpress_brews" (
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
	"method_id" uuid NOT NULL,
	"dose" numeric,
	"water" numeric,
	"steep_time" integer,
	"water_temp" integer
);
--> statement-breakpoint
CREATE TABLE "frenchpress_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frenchpress_brews_user_idx" ON "frenchpress_brews" ("user_id");--> statement-breakpoint
CREATE INDEX "frenchpress_brews_user_coffee_idx" ON "frenchpress_brews" ("user_id","coffee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frenchpress_brews_dialed_in_idx" ON "frenchpress_brews" ("coffee_id","method_id") WHERE is_dialed_in;--> statement-breakpoint
CREATE UNIQUE INDEX "frenchpress_methods_name_idx" ON "frenchpress_methods" ("name");--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_grinder_id_grinders_id_fkey" FOREIGN KEY ("grinder_id") REFERENCES "grinders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_brewing_device_id_brewing_devices_id_fkey" FOREIGN KEY ("brewing_device_id") REFERENCES "brewing_devices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_method_id_frenchpress_methods_id_fkey" FOREIGN KEY ("method_id") REFERENCES "frenchpress_methods"("id");--> statement-breakpoint
ALTER TABLE "frenchpress_methods" ADD CONSTRAINT "frenchpress_methods_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;