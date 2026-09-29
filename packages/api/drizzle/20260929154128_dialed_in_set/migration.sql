-- coffee_id is denormalized from the brew so a set can be listed without
-- joining five brew tables. Add it nullable, fill it, then require it.
ALTER TABLE "dialed_in_brews" ADD COLUMN "coffee_id" uuid;--> statement-breakpoint
UPDATE "dialed_in_brews" AS d
SET "coffee_id" = s."coffee_id"
FROM "espresso_shots" AS s
WHERE d."brew_id" = s."id" AND d."brewing_method" = 'espresso';--> statement-breakpoint
UPDATE "dialed_in_brews" AS d
SET "coffee_id" = b."coffee_id"
FROM "aeropress_brews" AS b
WHERE d."brew_id" = b."id" AND d."brewing_method" = 'aeropress';--> statement-breakpoint
UPDATE "dialed_in_brews" AS d
SET "coffee_id" = b."coffee_id"
FROM "pourover_brews" AS b
WHERE d."brew_id" = b."id" AND d."brewing_method" = 'pourover';--> statement-breakpoint
UPDATE "dialed_in_brews" AS d
SET "coffee_id" = b."coffee_id"
FROM "frenchpress_brews" AS b
WHERE d."brew_id" = b."id" AND d."brewing_method" = 'frenchpress';--> statement-breakpoint
UPDATE "dialed_in_brews" AS d
SET "coffee_id" = b."coffee_id"
FROM "cold_brew_brews" AS b
WHERE d."brew_id" = b."id" AND d."brewing_method" = 'coldBrew';--> statement-breakpoint
-- Many members per coffee × method × device; the old unique pointer cannot
-- survive the flag backfill.
DROP INDEX "dialed_in_brews_user_method_device_idx";--> statement-breakpoint
INSERT INTO "dialed_in_brews" ("user_id", "coffee_id", "brewing_method", "brewing_device_id", "brew_id")
SELECT "user_id", "coffee_id", 'espresso'::"brewing_method", "brewing_device_id", "id"
FROM "espresso_shots"
WHERE "is_dialed_in"
ON CONFLICT ("brew_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "dialed_in_brews" ("user_id", "coffee_id", "brewing_method", "brewing_device_id", "brew_id")
SELECT "user_id", "coffee_id", 'aeropress'::"brewing_method", "brewing_device_id", "id"
FROM "aeropress_brews"
WHERE "is_dialed_in"
ON CONFLICT ("brew_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "dialed_in_brews" ("user_id", "coffee_id", "brewing_method", "brewing_device_id", "brew_id")
SELECT "user_id", "coffee_id", 'pourover'::"brewing_method", "brewing_device_id", "id"
FROM "pourover_brews"
WHERE "is_dialed_in"
ON CONFLICT ("brew_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "dialed_in_brews" ("user_id", "coffee_id", "brewing_method", "brewing_device_id", "brew_id")
SELECT "user_id", "coffee_id", 'frenchpress'::"brewing_method", "brewing_device_id", "id"
FROM "frenchpress_brews"
WHERE "is_dialed_in"
ON CONFLICT ("brew_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "dialed_in_brews" ("user_id", "coffee_id", "brewing_method", "brewing_device_id", "brew_id")
SELECT "user_id", "coffee_id", 'coldBrew'::"brewing_method", "brewing_device_id", "id"
FROM "cold_brew_brews"
WHERE "is_dialed_in"
ON CONFLICT ("brew_id") DO NOTHING;--> statement-breakpoint
DELETE FROM "dialed_in_brews" WHERE "coffee_id" IS NULL;--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ALTER COLUMN "coffee_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "aeropress_brews_dialed_in_idx";--> statement-breakpoint
DROP INDEX "cold_brew_brews_dialed_in_idx";--> statement-breakpoint
DROP INDEX "espresso_shots_dialed_in_idx";--> statement-breakpoint
DROP INDEX "frenchpress_brews_dialed_in_idx";--> statement-breakpoint
DROP INDEX "pourover_brews_dialed_in_idx";--> statement-breakpoint
ALTER TABLE "aeropress_brews" DROP COLUMN "is_dialed_in";--> statement-breakpoint
ALTER TABLE "cold_brew_brews" DROP COLUMN "is_dialed_in";--> statement-breakpoint
ALTER TABLE "espresso_shots" DROP COLUMN "is_dialed_in";--> statement-breakpoint
ALTER TABLE "frenchpress_brews" DROP COLUMN "is_dialed_in";--> statement-breakpoint
ALTER TABLE "pourover_brews" DROP COLUMN "is_dialed_in";--> statement-breakpoint
CREATE INDEX "dialed_in_brews_set_idx" ON "dialed_in_brews" ("user_id","coffee_id","brewing_method","brewing_device_id");--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ADD CONSTRAINT "dialed_in_brews_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Editing a brew onto another coffee or device must move its membership with
-- it. Method cannot change (the brew lives in one table).
CREATE OR REPLACE FUNCTION sync_dialed_in_brew()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "dialed_in_brews"
	SET "coffee_id" = NEW.coffee_id,
		"brewing_device_id" = NEW.brewing_device_id,
		"updated_at" = now()
	WHERE "brew_id" = NEW.id
		AND ("coffee_id" IS DISTINCT FROM NEW.coffee_id
			OR "brewing_device_id" IS DISTINCT FROM NEW.brewing_device_id);
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER espresso_shots_sync_dialed_in
	AFTER UPDATE OF coffee_id, brewing_device_id ON "espresso_shots"
	FOR EACH ROW EXECUTE FUNCTION sync_dialed_in_brew();
CREATE TRIGGER aeropress_brews_sync_dialed_in
	AFTER UPDATE OF coffee_id, brewing_device_id ON "aeropress_brews"
	FOR EACH ROW EXECUTE FUNCTION sync_dialed_in_brew();
CREATE TRIGGER pourover_brews_sync_dialed_in
	AFTER UPDATE OF coffee_id, brewing_device_id ON "pourover_brews"
	FOR EACH ROW EXECUTE FUNCTION sync_dialed_in_brew();
CREATE TRIGGER frenchpress_brews_sync_dialed_in
	AFTER UPDATE OF coffee_id, brewing_device_id ON "frenchpress_brews"
	FOR EACH ROW EXECUTE FUNCTION sync_dialed_in_brew();
CREATE TRIGGER cold_brew_brews_sync_dialed_in
	AFTER UPDATE OF coffee_id, brewing_device_id ON "cold_brew_brews"
	FOR EACH ROW EXECUTE FUNCTION sync_dialed_in_brew();
