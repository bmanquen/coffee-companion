CREATE TABLE "coffee_origins" (
	"coffee_id" uuid,
	"country_id" uuid,
	"region_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coffee_origins_pkey" PRIMARY KEY("coffee_id","country_id")
);
--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD CONSTRAINT "coffee_origins_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD CONSTRAINT "coffee_origins_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id");--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD CONSTRAINT "coffee_origins_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id");--> statement-breakpoint
-- Keep a coffee's country. Keep its region only when that region belongs to
-- that country. Region-only rows take the region's country.
INSERT INTO "coffee_origins" ("coffee_id", "country_id", "region_id")
SELECT
	c."id",
	c."country_id",
	CASE
		WHEN r."country_id" IS NOT DISTINCT FROM c."country_id" THEN c."region_id"
		ELSE NULL
	END
FROM "coffees" AS c
LEFT JOIN "regions" AS r ON r."id" = c."region_id"
WHERE c."country_id" IS NOT NULL
UNION ALL
SELECT c."id", r."country_id", c."region_id"
FROM "coffees" AS c
INNER JOIN "regions" AS r ON r."id" = c."region_id"
WHERE c."country_id" IS NULL
	AND c."region_id" IS NOT NULL
	AND r."country_id" IS NOT NULL;--> statement-breakpoint
-- A region with no country cannot become an origin row (country_id is required).
DO $refuse_unrecoverable_origins$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "coffees" AS c
		LEFT JOIN "regions" AS r ON r."id" = c."region_id"
		WHERE c."country_id" IS NULL
			AND c."region_id" IS NOT NULL
			AND r."country_id" IS NULL
	) THEN
		RAISE EXCEPTION 'cannot migrate coffee origins: a coffee has a region and no country, and that region has no country';
	END IF;
END
$refuse_unrecoverable_origins$;--> statement-breakpoint
ALTER TABLE "coffees" DROP CONSTRAINT "coffees_country_id_countries_id_fkey";--> statement-breakpoint
ALTER TABLE "coffees" DROP CONSTRAINT "coffees_region_id_regions_id_fkey";--> statement-breakpoint
DROP INDEX "coffees_user_country_idx";--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "country_id";--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "region_id";