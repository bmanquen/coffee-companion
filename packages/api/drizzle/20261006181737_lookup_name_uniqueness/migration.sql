DROP INDEX "aeropress_methods_name_idx";--> statement-breakpoint
DROP INDEX "brewing_device_types_name_idx";--> statement-breakpoint
DROP INDEX "coffee_processes_name_idx";--> statement-breakpoint
DROP INDEX "countries_name_idx";--> statement-breakpoint
DROP INDEX "farms_name_region_idx";--> statement-breakpoint
DROP INDEX "frenchpress_methods_name_idx";--> statement-breakpoint
DROP INDEX "pourover_methods_name_idx";--> statement-breakpoint
DROP INDEX "regions_name_country_idx";--> statement-breakpoint
DROP INDEX "roast_levels_name_idx";--> statement-breakpoint
DROP INDEX "roasters_name_idx";--> statement-breakpoint
DROP INDEX "varieties_name_idx";--> statement-breakpoint
ALTER TABLE "aeropress_methods" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "aeropress_methods" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brewing_device_types" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "brewing_device_types" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coffee_processes" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "coffee_processes" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "frenchpress_methods" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "frenchpress_methods" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pourover_methods" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "pourover_methods" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roast_levels" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "roast_levels" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roasters" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "roasters" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "varieties" ADD COLUMN "name_key" text GENERATED ALWAYS AS (lower(name)) STORED;--> statement-breakpoint
ALTER TABLE "varieties" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
CREATE FUNCTION lookup_name_guard() RETURNS trigger LANGUAGE plpgsql AS $lookup_name_guard$
DECLARE
	scope_col text;
	scope_val text;
	key text;
	shared_lock bigint;
	saved text;
BEGIN
	IF TG_NARGS > 0 THEN
		scope_col := TG_ARGV[0];
		scope_val := to_jsonb(NEW) ->> scope_col;
	END IF;
	key := lower(NEW.name);
	shared_lock := hashtextextended(
		format('%s/%s/%s', TG_RELID::text, coalesce(scope_val, ''), key),
		0
	);

	IF NEW.user_id IS NULL THEN
		PERFORM pg_advisory_xact_lock(shared_lock);
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock_shared(shared_lock);
	PERFORM pg_advisory_xact_lock(
		hashtextextended(
			format(
				'%s/%s/%s/%s',
				TG_RELID::text,
				coalesce(scope_val, ''),
				key,
				NEW.user_id
			),
			0
		)
	);

	IF scope_col IS NULL THEN
		EXECUTE format(
			'SELECT name FROM %I WHERE user_id IS NULL AND name_key = $1',
			TG_TABLE_NAME
		) INTO saved USING key;
	ELSE
		EXECUTE format(
			'SELECT name FROM %I WHERE user_id IS NULL AND name_key = $1 AND %I IS NOT DISTINCT FROM $2::uuid',
			TG_TABLE_NAME,
			scope_col
		) INTO saved USING key, scope_val;
	END IF;

	IF saved IS NOT NULL THEN
		RAISE EXCEPTION
			USING ERRCODE = 'LKSHR',
				DETAIL = saved,
				TABLE = TG_TABLE_NAME,
				COLUMN = 'name',
				MESSAGE = format(
					'%s name %L matches shared default %L',
					TG_TABLE_NAME,
					NEW.name,
					saved
				);
	END IF;

	saved := NULL;
	IF scope_col IS NULL THEN
		EXECUTE format(
			'SELECT name FROM %I WHERE user_id = $1 AND name_key = $2 AND id IS DISTINCT FROM $3',
			TG_TABLE_NAME
		) INTO saved USING NEW.user_id, key, NEW.id;
	ELSE
		EXECUTE format(
			'SELECT name FROM %I WHERE user_id = $1 AND name_key = $2 AND id IS DISTINCT FROM $3 AND %I IS NOT DISTINCT FROM $4::uuid',
			TG_TABLE_NAME,
			scope_col
		) INTO saved USING NEW.user_id, key, NEW.id, scope_val;
	END IF;

	IF saved IS NOT NULL THEN
		RAISE EXCEPTION
			USING ERRCODE = 'LKOWN',
				DETAIL = saved,
				TABLE = TG_TABLE_NAME,
				COLUMN = 'name',
				MESSAGE = format(
					'%s name %L matches own entry %L',
					TG_TABLE_NAME,
					NEW.name,
					saved
				);
	END IF;

	RETURN NEW;
END
$lookup_name_guard$;--> statement-breakpoint
CREATE TRIGGER aeropress_methods_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "aeropress_methods"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER brewing_device_types_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "brewing_device_types"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER coffee_processes_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "coffee_processes"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER countries_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "countries"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER farms_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id, region_id ON "farms"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard('region_id');--> statement-breakpoint
CREATE TRIGGER frenchpress_methods_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "frenchpress_methods"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER pourover_methods_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "pourover_methods"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER regions_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id, country_id ON "regions"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard('country_id');--> statement-breakpoint
CREATE TRIGGER roast_levels_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "roast_levels"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER roasters_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "roasters"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE TRIGGER varieties_name_guard
	BEFORE INSERT OR UPDATE OF name, user_id ON "varieties"
	FOR EACH ROW EXECUTE FUNCTION lookup_name_guard();--> statement-breakpoint
CREATE FUNCTION lookup_fold_plan()
RETURNS TABLE (lookup regclass, loser uuid, keeper uuid)
LANGUAGE plpgsql AS $lookup_fold_plan$
DECLARE
	rec record;
	parent_relid oid;
	scope_expr text;
	join_sql text;
	progress int;
BEGIN
	DROP TABLE IF EXISTS lookup_fold_lookups;
	DROP TABLE IF EXISTS lookup_fold_pairs;
	DROP TABLE IF EXISTS lookup_fold_mapped;

	CREATE TEMP TABLE lookup_fold_lookups (
		relid oid PRIMARY KEY,
		rel regclass NOT NULL,
		scope_col text,
		ord int
	) ON COMMIT DROP;

	CREATE TEMP TABLE lookup_fold_pairs (
		lookup oid NOT NULL,
		loser uuid NOT NULL,
		keeper uuid NOT NULL,
		PRIMARY KEY (lookup, loser)
	) ON COMMIT DROP;

	INSERT INTO lookup_fold_lookups (relid, rel, scope_col)
	SELECT t.tgrelid, t.tgrelid::regclass,
		(regexp_match(pg_get_triggerdef(t.oid), $re$lookup_name_guard\('([^']*)'\)$re$))[1]
	FROM pg_trigger t
	JOIN pg_proc p ON p.oid = t.tgfoid
	WHERE p.proname = 'lookup_name_guard'
		AND NOT t.tgisinternal;

	UPDATE lookup_fold_lookups SET ord = 0 WHERE scope_col IS NULL;

	LOOP
		WITH next_ord AS (
			SELECT child.relid, parent.ord + 1 AS ord
			FROM lookup_fold_lookups child
			JOIN pg_constraint c
				ON c.conrelid = child.relid AND c.contype = 'f'
			JOIN pg_attribute a
				ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
			JOIN lookup_fold_lookups parent ON parent.relid = c.confrelid
			WHERE child.scope_col IS NOT NULL
				AND child.ord IS NULL
				AND a.attname = child.scope_col
				AND parent.ord IS NOT NULL
		)
		UPDATE lookup_fold_lookups l
		SET ord = next_ord.ord
		FROM next_ord
		WHERE l.relid = next_ord.relid;
		GET DIAGNOSTICS progress = ROW_COUNT;
		EXIT WHEN progress = 0;
	END LOOP;

	UPDATE lookup_fold_lookups SET ord = 0 WHERE ord IS NULL;

	FOR rec IN
		SELECT * FROM lookup_fold_lookups ORDER BY ord, rel::text
	LOOP
		parent_relid := NULL;
		IF rec.scope_col IS NULL THEN
			scope_expr := 'NULL::uuid';
			join_sql := '';
		ELSE
			SELECT c.confrelid INTO parent_relid
			FROM pg_constraint c
			JOIN pg_attribute a
				ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
			WHERE c.conrelid = rec.relid
				AND c.contype = 'f'
				AND a.attname = rec.scope_col
				AND c.confrelid IN (SELECT l.relid FROM lookup_fold_lookups l);

			scope_expr := format(
				'COALESCE(pairs.keeper, l.%I)',
				rec.scope_col
			);
			join_sql := format(
				'LEFT JOIN lookup_fold_pairs pairs ON pairs.lookup = %s AND pairs.loser = l.%I',
				coalesce(parent_relid, 0),
				rec.scope_col
			);
		END IF;

		DROP TABLE IF EXISTS lookup_fold_mapped;
		EXECUTE format(
			'CREATE TEMP TABLE lookup_fold_mapped ON COMMIT DROP AS
			 SELECT l.id, l.user_id, l.name_key, l.created_at, %s AS effective_scope
			 FROM %s l %s',
			scope_expr,
			rec.rel,
			join_sql
		);

		INSERT INTO lookup_fold_pairs (lookup, loser, keeper)
		SELECT rec.relid, mapped.id, COALESCE(shared.keeper, own.keeper)
		FROM lookup_fold_mapped mapped
		LEFT JOIN LATERAL (
			SELECT s.id AS keeper
			FROM lookup_fold_mapped s
			WHERE s.user_id IS NULL
				AND s.effective_scope IS NOT DISTINCT FROM mapped.effective_scope
				AND s.name_key = mapped.name_key
			ORDER BY s.created_at, s.id
			LIMIT 1
		) shared ON true
		LEFT JOIN LATERAL (
			SELECT o.id AS keeper
			FROM lookup_fold_mapped o
			WHERE o.user_id IS NOT DISTINCT FROM mapped.user_id
				AND o.effective_scope IS NOT DISTINCT FROM mapped.effective_scope
				AND o.name_key = mapped.name_key
			ORDER BY o.created_at, o.id
			LIMIT 1
		) own ON true
		WHERE mapped.id IS DISTINCT FROM COALESCE(shared.keeper, own.keeper);
	END LOOP;

	RETURN QUERY
	SELECT p.lookup::regclass, p.loser, p.keeper
	FROM lookup_fold_pairs p;
END
$lookup_fold_plan$;--> statement-breakpoint
CREATE FUNCTION lookup_fold()
RETURNS TABLE (lookup regclass, loser uuid, keeper uuid)
LANGUAGE plpgsql AS $lookup_fold$
DECLARE
	trig record;
	rec record;
	fk record;
	pk_names text[];
	other_names text[];
	pk_expr text;
	others_expr text;
	fk_mapped_expr text;
	disagree boolean;
	coffee_row record;
	candidate text;
	suffix int;
	taken boolean;
BEGIN
	FOR trig IN
		SELECT t.tgrelid::regclass AS rel, t.tgname
		FROM pg_trigger t
		JOIN pg_proc p ON p.oid = t.tgfoid
		WHERE p.proname = 'lookup_name_guard'
			AND NOT t.tgisinternal
	LOOP
		EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', trig.rel, trig.tgname);
	END LOOP;

	BEGIN
		DROP TABLE IF EXISTS lookup_fold_applied;
		CREATE TEMP TABLE lookup_fold_applied (
			lookup regclass,
			loser uuid,
			keeper uuid
		) ON COMMIT DROP;

		INSERT INTO lookup_fold_applied
		SELECT * FROM lookup_fold_plan();

		-- Folding a user's roaster into its shared twin can give one user two
		-- coffees with the same roaster and name. Rename the later ones so this
		-- function never has to choose between two coffees. Later shared-default
		-- folds hit the same case. Coffees with no roaster cannot collide on
		-- that index (NULLS DISTINCT), so they are left alone. If `name (id)`
		-- is already taken on the keeper roaster, try `name (id, 1)` and up.
		FOR coffee_row IN
			SELECT ranked.id, ranked.user_id, ranked.roaster_id, ranked.name
			FROM (
				SELECT coffee.id, coffee.user_id, coffee.name,
					coalesce(plan.keeper, coffee.roaster_id) AS roaster_id,
					ROW_NUMBER() OVER (
						PARTITION BY coffee.user_id, coalesce(plan.keeper, coffee.roaster_id), coffee.name
						ORDER BY (plan.loser IS NULL) DESC, coffee.created_at ASC, coffee.id ASC
					) AS rn
				FROM "coffees" coffee
				LEFT JOIN lookup_fold_pairs plan
					ON plan.lookup = 'roasters'::regclass
					AND plan.loser = coffee.roaster_id
				WHERE coffee.roaster_id IS NOT NULL
			) AS ranked
			WHERE ranked.rn > 1
		LOOP
			suffix := 0;
			LOOP
				candidate := coffee_row.name || ' (' || coffee_row.id::text
					|| CASE WHEN suffix = 0 THEN ')' ELSE ', ' || suffix::text || ')' END;
				SELECT EXISTS (
					SELECT 1
					FROM "coffees" other
					LEFT JOIN lookup_fold_pairs plan
						ON plan.lookup = 'roasters'::regclass
						AND plan.loser = other.roaster_id
					WHERE other.id <> coffee_row.id
						AND other.user_id IS NOT DISTINCT FROM coffee_row.user_id
						AND other.name = candidate
						AND coalesce(plan.keeper, other.roaster_id)
							IS NOT DISTINCT FROM coffee_row.roaster_id
				) INTO taken;
				EXIT WHEN NOT taken;
				suffix := suffix + 1;
			END LOOP;
			UPDATE "coffees" SET "name" = candidate WHERE id = coffee_row.id;
		END LOOP;

		FOR rec IN
			SELECT * FROM lookup_fold_lookups ORDER BY ord DESC, rel::text
		LOOP
			FOR fk IN
				SELECT
					c.conrelid AS ref_oid,
					c.conrelid::regclass AS ref_rel,
					a.attname AS col,
					array_length(c.conkey, 1) AS nkeys,
					pk.conkey AS pk_cols
				FROM pg_constraint c
				JOIN pg_attribute a
					ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
				LEFT JOIN pg_constraint pk
					ON pk.conrelid = c.conrelid AND pk.contype = 'p'
				WHERE c.contype = 'f'
					AND c.confrelid = rec.relid
			LOOP
				IF fk.nkeys <> 1 THEN
					RAISE EXCEPTION
						'lookup_fold cannot rewrite composite foreign keys on %',
						fk.ref_rel;
				END IF;

				IF fk.pk_cols IS NOT NULL AND fk.pk_cols[1] IS NOT NULL
					AND EXISTS (
						SELECT 1
						FROM unnest(fk.pk_cols) AS pk_att(attnum)
						JOIN pg_attribute a
							ON a.attrelid = fk.ref_oid AND a.attnum = pk_att.attnum
						WHERE a.attname = fk.col
					)
				THEN
					SELECT coalesce(array_agg(a.attname ORDER BY ordinality), ARRAY[]::text[])
					INTO pk_names
					FROM unnest(fk.pk_cols) WITH ORDINALITY AS att(attnum, ordinality)
					JOIN pg_attribute a
						ON a.attrelid = fk.ref_oid AND a.attnum = att.attnum;

					SELECT coalesce(
						array_agg(a.attname ORDER BY a.attnum) FILTER (
							WHERE a.attname <> ALL (pk_names)
								AND a.attname NOT IN ('created_at', 'updated_at')
						),
						ARRAY[]::text[]
					)
					INTO other_names
					FROM pg_attribute a
					WHERE a.attrelid = fk.ref_oid
						AND a.attnum > 0
						AND NOT a.attisdropped;

					pk_expr := (
						SELECT string_agg(
							CASE
								WHEN m.expr IS NOT NULL THEN m.expr
								ELSE format('t.%I', n)
							END,
							', '
						)
						FROM unnest(pk_names) AS n
						LEFT JOIN LATERAL (
							SELECT format(
								'COALESCE((SELECT p.keeper FROM lookup_fold_pairs p WHERE p.lookup = %s AND p.loser = t.%I), t.%I)',
								c.confrelid,
								n,
								n
							) AS expr
							FROM pg_constraint c
							JOIN pg_attribute a
								ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
							WHERE c.conrelid = fk.ref_oid
								AND c.contype = 'f'
								AND array_length(c.conkey, 1) = 1
								AND a.attname = n
								AND c.confrelid IN (SELECT l.relid FROM lookup_fold_lookups l)
						) m ON true
					);

					IF other_names = ARRAY[]::text[] THEN
						others_expr := '''[]''::jsonb';
					ELSE
						others_expr := (
							SELECT format(
								'jsonb_build_array(%s)',
								string_agg(
									CASE
										WHEN m.expr IS NOT NULL THEN m.expr
										ELSE format('t.%I', n)
									END,
									', '
								)
							)
							FROM unnest(other_names) AS n
							LEFT JOIN LATERAL (
								SELECT format(
									'COALESCE((SELECT p.keeper FROM lookup_fold_pairs p WHERE p.lookup = %s AND p.loser = t.%I), t.%I)',
									c.confrelid,
									n,
									n
								) AS expr
								FROM pg_constraint c
								JOIN pg_attribute a
									ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
								WHERE c.conrelid = fk.ref_oid
									AND c.contype = 'f'
									AND array_length(c.conkey, 1) = 1
									AND a.attname = n
									AND c.confrelid IN (SELECT l.relid FROM lookup_fold_lookups l)
							) m ON true
						);
					END IF;

					fk_mapped_expr := format(
						'COALESCE((SELECT p.keeper FROM lookup_fold_pairs p WHERE p.lookup = %s AND p.loser = t.%I), t.%I)',
						rec.relid,
						fk.col,
						fk.col
					);

					DROP TABLE IF EXISTS lookup_fold_rel;
					DROP TABLE IF EXISTS lookup_fold_rel_keep;
					EXECUTE format(
						$q$
						CREATE TEMP TABLE lookup_fold_rel ON COMMIT DROP AS
						SELECT
							t.ctid AS row_ctid,
							t.created_at,
							t.%I AS fk_raw,
							%s AS fk_mapped,
							jsonb_build_array(%s) AS pk_mapped,
							%s AS others_mapped
						FROM %s t
						WHERE t.%I IN (
							SELECT loser FROM lookup_fold_pairs WHERE lookup = %s
							UNION
							SELECT keeper FROM lookup_fold_pairs WHERE lookup = %s
						)
						$q$,
						fk.col,
						fk_mapped_expr,
						pk_expr,
						others_expr,
						fk.ref_rel,
						fk.col,
						rec.relid,
						rec.relid
					);

					CREATE TEMP TABLE lookup_fold_rel_keep ON COMMIT DROP AS
					SELECT DISTINCT ON (pk_mapped)
						row_ctid AS keep_ctid,
						pk_mapped,
						others_mapped AS keep_others
					FROM lookup_fold_rel
					ORDER BY pk_mapped,
						(fk_raw IS NOT DISTINCT FROM fk_mapped) DESC,
						created_at NULLS LAST,
						row_ctid;

					SELECT EXISTS (
						SELECT 1
						FROM lookup_fold_rel r
						JOIN lookup_fold_rel_keep k
							ON k.pk_mapped IS NOT DISTINCT FROM r.pk_mapped
						WHERE r.others_mapped IS DISTINCT FROM k.keep_others
					) INTO disagree;

					IF disagree THEN
						RAISE EXCEPTION
							'lookup_fold: % has disagreeing rows for the same key after mapping %',
							fk.ref_rel,
							rec.rel;
					END IF;

					EXECUTE format(
						$q$
						DELETE FROM %s t
						USING lookup_fold_rel r
						JOIN lookup_fold_rel_keep k
							ON k.pk_mapped IS NOT DISTINCT FROM r.pk_mapped
						WHERE t.ctid = r.row_ctid
							AND r.row_ctid IS DISTINCT FROM k.keep_ctid
						$q$,
						fk.ref_rel
					);
				END IF;

				EXECUTE format(
					$q$
					UPDATE %s AS ref
					SET %I = plan.keeper
					FROM lookup_fold_pairs plan
					WHERE plan.lookup = $1
						AND ref.%I = plan.loser
					$q$,
					fk.ref_rel,
					fk.col,
					fk.col
				) USING rec.relid;
			END LOOP;

			EXECUTE format(
				$q$
				DELETE FROM %s AS src
				USING lookup_fold_pairs plan
				WHERE plan.lookup = $1
					AND src.id = plan.loser
				$q$,
				rec.rel
			) USING rec.relid;
		END LOOP;
	EXCEPTION WHEN OTHERS THEN
		FOR trig IN
			SELECT t.tgrelid::regclass AS rel, t.tgname
			FROM pg_trigger t
			JOIN pg_proc p ON p.oid = t.tgfoid
			WHERE p.proname = 'lookup_name_guard'
				AND NOT t.tgisinternal
		LOOP
			EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', trig.rel, trig.tgname);
		END LOOP;
		RAISE;
	END;

	FOR trig IN
		SELECT t.tgrelid::regclass AS rel, t.tgname
		FROM pg_trigger t
		JOIN pg_proc p ON p.oid = t.tgfoid
		WHERE p.proname = 'lookup_name_guard'
			AND NOT t.tgisinternal
	LOOP
		EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', trig.rel, trig.tgname);
	END LOOP;

	RETURN QUERY SELECT a.lookup, a.loser, a.keeper FROM lookup_fold_applied a;
END
$lookup_fold$;--> statement-breakpoint
SELECT * FROM lookup_fold();--> statement-breakpoint
ALTER TABLE "aeropress_methods" ADD CONSTRAINT "aeropress_methods_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "brewing_device_types" ADD CONSTRAINT "brewing_device_types_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "coffee_processes" ADD CONSTRAINT "coffee_processes_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_name_key_region_id_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key","region_id");--> statement-breakpoint
ALTER TABLE "frenchpress_methods" ADD CONSTRAINT "frenchpress_methods_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "pourover_methods" ADD CONSTRAINT "pourover_methods_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_user_id_name_key_country_id_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key","country_id");--> statement-breakpoint
ALTER TABLE "roast_levels" ADD CONSTRAINT "roast_levels_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "roasters" ADD CONSTRAINT "roasters_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");--> statement-breakpoint
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_user_id_name_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","name_key");
