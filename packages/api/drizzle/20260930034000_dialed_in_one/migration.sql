-- One membership per user × coffee × method × device. Keep the newest row
-- when a triple already has more than one.
DELETE FROM "dialed_in_brews" AS d
USING "dialed_in_brews" AS keep
WHERE d."user_id" = keep."user_id"
	AND d."coffee_id" = keep."coffee_id"
	AND d."brewing_method" = keep."brewing_method"
	AND d."brewing_device_id" = keep."brewing_device_id"
	AND d."id" <> keep."id"
	AND (d."updated_at", d."id") < (keep."updated_at", keep."id");--> statement-breakpoint
DROP INDEX "dialed_in_brews_set_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "dialed_in_brews_triple_idx" ON "dialed_in_brews" ("user_id","coffee_id","brewing_method","brewing_device_id");--> statement-breakpoint
-- Editing a marked brew onto a triple that already has one replaces it.
CREATE OR REPLACE FUNCTION sync_dialed_in_brew()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM "dialed_in_brews" AS d
	USING "dialed_in_brews" AS mine
	WHERE mine."brew_id" = NEW.id
		AND d."id" <> mine."id"
		AND d."user_id" = mine."user_id"
		AND d."brewing_method" = mine."brewing_method"
		AND d."coffee_id" = NEW.coffee_id
		AND d."brewing_device_id" = NEW.brewing_device_id;
	UPDATE "dialed_in_brews"
	SET "coffee_id" = NEW.coffee_id,
		"brewing_device_id" = NEW.brewing_device_id,
		"updated_at" = now()
	WHERE "brew_id" = NEW.id
		AND ("coffee_id" IS DISTINCT FROM NEW.coffee_id
			OR "brewing_device_id" IS DISTINCT FROM NEW.brewing_device_id);
	RETURN NEW;
END;
$$;
