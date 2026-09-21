ALTER TABLE "coffees" DROP CONSTRAINT "coffees_process_id_coffee_processes_id_fkey";--> statement-breakpoint
DROP INDEX "coffees_user_process_id_idx";--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD COLUMN "process_id" uuid;--> statement-breakpoint
UPDATE "coffee_origins" AS o
SET "process_id" = c."process_id"
FROM "coffees" AS c
WHERE o."coffee_id" = c."id"
	AND c."process_id" IS NOT NULL;--> statement-breakpoint
-- Process lives on origin rows. A bag-level process with no country cannot
-- be copied without inventing an origin.
DO $refuse_unrecoverable_process$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "coffees" AS c
		LEFT JOIN "coffee_origins" AS o ON o."coffee_id" = c."id"
		WHERE c."process_id" IS NOT NULL
			AND o."coffee_id" IS NULL
	) THEN
		RAISE EXCEPTION 'cannot migrate coffee origins: a coffee has a process and no origin';
	END IF;
END
$refuse_unrecoverable_process$;--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "process_id";--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD CONSTRAINT "coffee_origins_process_id_coffee_processes_id_fkey" FOREIGN KEY ("process_id") REFERENCES "coffee_processes"("id") ON DELETE SET NULL;