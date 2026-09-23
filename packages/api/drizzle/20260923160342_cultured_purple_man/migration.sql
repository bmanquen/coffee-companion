CREATE TYPE "brewing_method" AS ENUM('espresso', 'aeropress', 'pourover', 'frenchpress', 'coldBrew');--> statement-breakpoint
CREATE TABLE "dialed_in_brews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"brewing_method" "brewing_method" NOT NULL,
	"brewing_device_id" uuid NOT NULL,
	"brew_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dialed_in_brews_user_method_device_idx" ON "dialed_in_brews" ("user_id","brewing_method","brewing_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dialed_in_brews_brew_idx" ON "dialed_in_brews" ("brew_id");--> statement-breakpoint
CREATE INDEX "dialed_in_brews_user_idx" ON "dialed_in_brews" ("user_id");--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ADD CONSTRAINT "dialed_in_brews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ADD CONSTRAINT "dialed_in_brews_brewing_device_id_brewing_devices_id_fkey" FOREIGN KEY ("brewing_device_id") REFERENCES "brewing_devices"("id") ON DELETE CASCADE;--> statement-breakpoint
-- brew_id cannot be a single FK (brews live in five tables). Clear the
-- mapping when any referenced brew is deleted so the pointer cannot dangle.
CREATE OR REPLACE FUNCTION clear_dialed_in_brew()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM "dialed_in_brews" WHERE "brew_id" = OLD.id;
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER espresso_shots_clear_dialed_in
	AFTER DELETE ON "espresso_shots"
	FOR EACH ROW EXECUTE FUNCTION clear_dialed_in_brew();--> statement-breakpoint
CREATE TRIGGER aeropress_brews_clear_dialed_in
	AFTER DELETE ON "aeropress_brews"
	FOR EACH ROW EXECUTE FUNCTION clear_dialed_in_brew();--> statement-breakpoint
CREATE TRIGGER pourover_brews_clear_dialed_in
	AFTER DELETE ON "pourover_brews"
	FOR EACH ROW EXECUTE FUNCTION clear_dialed_in_brew();--> statement-breakpoint
CREATE TRIGGER frenchpress_brews_clear_dialed_in
	AFTER DELETE ON "frenchpress_brews"
	FOR EACH ROW EXECUTE FUNCTION clear_dialed_in_brew();--> statement-breakpoint
CREATE TRIGGER cold_brew_brews_clear_dialed_in
	AFTER DELETE ON "cold_brew_brews"
	FOR EACH ROW EXECUTE FUNCTION clear_dialed_in_brew();