-- Two marked brews edited onto the same triple can both miss the occupant
-- delete; retry the replace after unique_violation instead of failing the edit.
CREATE OR REPLACE FUNCTION sync_dialed_in_brew()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	attempts int := 0;
BEGIN
	LOOP
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
		EXCEPTION
			WHEN unique_violation THEN
				attempts := attempts + 1;
				IF attempts >= 5 THEN
					RAISE;
				END IF;
		END;
	END LOOP;
END;
$$;
