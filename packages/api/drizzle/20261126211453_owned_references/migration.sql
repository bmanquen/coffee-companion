-- A row may only reference a lookup that is shared (user_id IS NULL) or has
-- the row's owner. Join rows have no user_id, so they take their parent's.
-- Raised as a foreign key violation, with PostgreSQL's own DETAIL wording, so
-- the API maps both kinds of refusal the same way.
CREATE FUNCTION lookup_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $lookup_reference_guard$
DECLARE
	rec jsonb := to_jsonb(NEW);
	ref text := rec ->> TG_ARGV[0];
	owner text := rec ->> 'user_id';
	allowed boolean;
BEGIN
	IF ref IS NULL THEN
		RETURN NEW;
	END IF;
	IF TG_NARGS > 2 THEN
		EXECUTE format('SELECT user_id FROM %I WHERE id = $1', TG_ARGV[2])
			INTO owner USING (rec ->> TG_ARGV[3])::uuid;
	END IF;
	EXECUTE format(
		'SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND (user_id IS NULL OR user_id = $2))',
		TG_ARGV[1]
	) INTO allowed USING ref::uuid, owner;
	IF NOT allowed THEN
		RAISE EXCEPTION
			USING ERRCODE = 'foreign_key_violation',
				TABLE = TG_TABLE_NAME,
				COLUMN = TG_ARGV[0],
				MESSAGE = format(
					'%s.%s must reference a shared %s row or one with the same owner',
					TG_TABLE_NAME,
					TG_ARGV[0],
					TG_ARGV[1]
				),
				DETAIL = format(
					'Key (%s)=(%s) is not present in table "%s".',
					TG_ARGV[0],
					ref,
					TG_ARGV[1]
				);
	END IF;
	RETURN NEW;
END
$lookup_reference_guard$;--> statement-breakpoint
-- An owner change would strand the rows that reference this one: a private
-- lookup someone else's rows use, or a Coffee whose origins use its owner's
-- lookups.
CREATE FUNCTION owner_lock() RETURNS trigger LANGUAGE plpgsql AS $owner_lock$
BEGIN
	RAISE EXCEPTION
		USING ERRCODE = 'integrity_constraint_violation',
			TABLE = TG_TABLE_NAME,
			COLUMN = 'user_id',
			MESSAGE = format('%s.user_id cannot change', TG_TABLE_NAME);
END
$owner_lock$;--> statement-breakpoint
DO $owned_references$
DECLARE
	ref record;
	bad bigint;
	report text := '';
	owner_expr text;
	tbl text;
BEGIN
	CREATE TEMP TABLE owned_references (
		tbl text, col text, target text, parent text, parent_key text
	) ON COMMIT DROP;
	INSERT INTO owned_references VALUES
		('coffees', 'roaster_id', 'roasters', NULL, NULL),
		('coffees', 'roast_level_id', 'roast_levels', NULL, NULL),
		('coffee_origins', 'country_id', 'countries', 'coffees', 'coffee_id'),
		('coffee_origins', 'region_id', 'regions', 'coffees', 'coffee_id'),
		('coffee_origins', 'process_id', 'coffee_processes', 'coffees', 'coffee_id'),
		('green_coffees', 'country_id', 'countries', NULL, NULL),
		('green_coffees', 'region_id', 'regions', NULL, NULL),
		('green_coffees', 'farm_id', 'farms', NULL, NULL),
		('green_coffees', 'process_id', 'coffee_processes', NULL, NULL),
		('coffees_varieties', 'variety_id', 'varieties', 'coffees', 'coffee_id'),
		('green_coffees_varieties', 'variety_id', 'varieties', 'green_coffees', 'green_coffee_id'),
		('brewing_devices', 'type_id', 'brewing_device_types', NULL, NULL),
		('aeropress_brews', 'method_id', 'aeropress_methods', NULL, NULL),
		('pourover_brews', 'method_id', 'pourover_methods', NULL, NULL),
		('frenchpress_brews', 'method_id', 'frenchpress_methods', NULL, NULL),
		('regions', 'country_id', 'countries', NULL, NULL),
		('farms', 'region_id', 'regions', NULL, NULL),
		-- Owned rows: checked here, then held by the composite foreign keys below.
		('espresso_shots', 'coffee_id', 'coffees', NULL, NULL),
		('espresso_shots', 'grinder_id', 'grinders', NULL, NULL),
		('espresso_shots', 'brewing_device_id', 'brewing_devices', NULL, NULL),
		('aeropress_brews', 'coffee_id', 'coffees', NULL, NULL),
		('aeropress_brews', 'grinder_id', 'grinders', NULL, NULL),
		('aeropress_brews', 'brewing_device_id', 'brewing_devices', NULL, NULL),
		('pourover_brews', 'coffee_id', 'coffees', NULL, NULL),
		('pourover_brews', 'grinder_id', 'grinders', NULL, NULL),
		('pourover_brews', 'brewing_device_id', 'brewing_devices', NULL, NULL),
		('frenchpress_brews', 'coffee_id', 'coffees', NULL, NULL),
		('frenchpress_brews', 'grinder_id', 'grinders', NULL, NULL),
		('frenchpress_brews', 'brewing_device_id', 'brewing_devices', NULL, NULL),
		('cold_brew_brews', 'coffee_id', 'coffees', NULL, NULL),
		('cold_brew_brews', 'grinder_id', 'grinders', NULL, NULL),
		('cold_brew_brews', 'brewing_device_id', 'brewing_devices', NULL, NULL),
		('dialed_in_brews', 'coffee_id', 'coffees', NULL, NULL),
		('dialed_in_brews', 'brewing_device_id', 'brewing_devices', NULL, NULL);

	-- Hold off writers from the count until this transaction commits, so no
	-- row can slip in between the count and the triggers.
	FOR tbl IN
		SELECT DISTINCT t FROM owned_references, unnest(ARRAY[owned_references.tbl, target]) AS t ORDER BY t
	LOOP
		EXECUTE format('LOCK TABLE %I IN SHARE MODE', tbl);
	END LOOP;

	-- Rows that already break the rule have no safe automatic fix (a Coffee's
	-- roaster is required), so stop and report them instead.
	FOR ref IN SELECT * FROM owned_references LOOP
		owner_expr := CASE
			WHEN ref.parent IS NULL THEN 't.user_id'
			ELSE format('(SELECT p.user_id FROM %I p WHERE p.id = t.%I)', ref.parent, ref.parent_key)
		END;
		EXECUTE format(
			'SELECT count(*) FROM %I t JOIN %I l ON l.id = t.%I WHERE l.user_id IS NOT NULL AND l.user_id IS DISTINCT FROM %s',
			ref.tbl, ref.target, ref.col, owner_expr
		) INTO bad;
		IF bad > 0 THEN
			report := report || format(' %s.%s: %s;', ref.tbl, ref.col, bad);
		END IF;
	END LOOP;
	IF report <> '' THEN
		RAISE EXCEPTION 'Rows reference another user''s data:%', report;
	END IF;

	FOR ref IN
		SELECT * FROM owned_references
		WHERE target NOT IN ('coffees', 'grinders', 'brewing_devices')
	LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, %I ON %I FOR EACH ROW EXECUTE FUNCTION lookup_reference_guard(%L, %L%s)',
			ref.tbl || '_' || ref.col || '_guard',
			ref.col,
			coalesce(ref.parent_key, 'user_id'),
			ref.tbl,
			ref.col,
			ref.target,
			CASE WHEN ref.parent IS NULL THEN '' ELSE format(', %L, %L', ref.parent, ref.parent_key) END
		);
	END LOOP;

	FOREACH tbl IN ARRAY ARRAY[
		'countries', 'regions', 'farms', 'roasters', 'roast_levels',
		'coffee_processes', 'varieties', 'brewing_device_types',
		'aeropress_methods', 'pourover_methods', 'frenchpress_methods',
		'coffees', 'green_coffees'
	] LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE UPDATE OF user_id ON %I FOR EACH ROW WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id) EXECUTE FUNCTION owner_lock()',
			tbl || '_owner_lock',
			tbl
		);
	END LOOP;
END
$owned_references$;--> statement-breakpoint
ALTER TABLE "aeropress_brews" DROP CONSTRAINT "aeropress_brews_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "aeropress_brews" DROP CONSTRAINT "aeropress_brews_grinder_id_grinders_id_fkey";--> statement-breakpoint
ALTER TABLE "aeropress_brews" DROP CONSTRAINT "aeropress_brews_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "cold_brew_brews" DROP CONSTRAINT "cold_brew_brews_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "cold_brew_brews" DROP CONSTRAINT "cold_brew_brews_grinder_id_grinders_id_fkey";--> statement-breakpoint
ALTER TABLE "cold_brew_brews" DROP CONSTRAINT "cold_brew_brews_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "dialed_in_brews" DROP CONSTRAINT "dialed_in_brews_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "dialed_in_brews" DROP CONSTRAINT "dialed_in_brews_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "espresso_shots" DROP CONSTRAINT "espresso_shots_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "espresso_shots" DROP CONSTRAINT "espresso_shots_grinder_id_grinders_id_fkey";--> statement-breakpoint
ALTER TABLE "espresso_shots" DROP CONSTRAINT "espresso_shots_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "frenchpress_brews" DROP CONSTRAINT "frenchpress_brews_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "frenchpress_brews" DROP CONSTRAINT "frenchpress_brews_grinder_id_grinders_id_fkey";--> statement-breakpoint
ALTER TABLE "frenchpress_brews" DROP CONSTRAINT "frenchpress_brews_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "pourover_brews" DROP CONSTRAINT "pourover_brews_coffee_id_coffees_id_fkey";--> statement-breakpoint
ALTER TABLE "pourover_brews" DROP CONSTRAINT "pourover_brews_grinder_id_grinders_id_fkey";--> statement-breakpoint
ALTER TABLE "pourover_brews" DROP CONSTRAINT "pourover_brews_brewing_device_id_brewing_devices_id_fkey";--> statement-breakpoint
ALTER TABLE "brewing_devices" ADD CONSTRAINT "brewing_devices_id_user_id_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_id_user_id_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "grinders" ADD CONSTRAINT "grinders_id_user_id_key" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "aeropress_brews" ADD CONSTRAINT "aeropress_brews_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "aeropress_brews" ADD CONSTRAINT "aeropress_brews_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "aeropress_brews" ADD CONSTRAINT "aeropress_brews_grinder_owner_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "grinders"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cold_brew_brews" ADD CONSTRAINT "cold_brew_brews_grinder_owner_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "grinders"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ADD CONSTRAINT "dialed_in_brews_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dialed_in_brews" ADD CONSTRAINT "dialed_in_brews_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_grinder_owner_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "grinders"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "frenchpress_brews" ADD CONSTRAINT "frenchpress_brews_grinder_owner_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "grinders"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pourover_brews" ADD CONSTRAINT "pourover_brews_coffee_owner_fk" FOREIGN KEY ("coffee_id","user_id") REFERENCES "coffees"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pourover_brews" ADD CONSTRAINT "pourover_brews_brewing_device_owner_fk" FOREIGN KEY ("brewing_device_id","user_id") REFERENCES "brewing_devices"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pourover_brews" ADD CONSTRAINT "pourover_brews_grinder_owner_fk" FOREIGN KEY ("grinder_id","user_id") REFERENCES "grinders"("id","user_id") ON DELETE CASCADE;