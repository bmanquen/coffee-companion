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
-- Country-bearing rows copy as-is. Region-only rows take the region's country
-- so dropping coffees.country_id / region_id does not lose that origin.
INSERT INTO "coffee_origins" ("coffee_id", "country_id", "region_id")
SELECT "id", "country_id", "region_id"
FROM "coffees"
WHERE "country_id" IS NOT NULL
UNION ALL
SELECT c."id", r."country_id", c."region_id"
FROM "coffees" AS c
INNER JOIN "regions" AS r ON r."id" = c."region_id"
WHERE c."country_id" IS NULL
	AND c."region_id" IS NOT NULL
	AND r."country_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "coffees" DROP CONSTRAINT "coffees_country_id_countries_id_fkey";--> statement-breakpoint
ALTER TABLE "coffees" DROP CONSTRAINT "coffees_region_id_regions_id_fkey";--> statement-breakpoint
DROP INDEX "coffees_user_country_idx";--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "country_id";--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "region_id";