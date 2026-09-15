-- Older releases allowed duplicate (user, roaster, name) rows. Keep the oldest
-- in each group and rename the rest so creating the unique index cannot fail.
-- Repeat until every remaining name is free: a generated `name (id)` can
-- already exist as unrestricted text.
DO $rename_duplicate_coffees$
BEGIN
	LOOP
		UPDATE "coffees" AS keepers
		SET "name" = keepers."name" || ' (' || keepers."id"::text || ')'
		FROM (
			SELECT id,
				ROW_NUMBER() OVER (
					PARTITION BY user_id, roaster_id, name
					ORDER BY created_at ASC, id ASC
				) AS rn
			FROM "coffees"
		) AS ranked
		WHERE keepers.id = ranked.id AND ranked.rn > 1;
		EXIT WHEN NOT FOUND;
	END LOOP;
END
$rename_duplicate_coffees$;--> statement-breakpoint
CREATE UNIQUE INDEX "coffees_user_roaster_name_idx" ON "coffees" ("user_id","roaster_id","name");
