ALTER TABLE "coffees" DROP CONSTRAINT "coffees_process_id_coffee_processes_id_fkey";--> statement-breakpoint
DROP INDEX "coffees_user_process_id_idx";--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD COLUMN "process_id" uuid;--> statement-breakpoint
UPDATE "coffee_origins" AS o
SET "process_id" = c."process_id"
FROM "coffees" AS c
WHERE o."coffee_id" = c."id"
	AND c."process_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "process_id";--> statement-breakpoint
ALTER TABLE "coffee_origins" ADD CONSTRAINT "coffee_origins_process_id_coffee_processes_id_fkey" FOREIGN KEY ("process_id") REFERENCES "coffee_processes"("id") ON DELETE SET NULL;