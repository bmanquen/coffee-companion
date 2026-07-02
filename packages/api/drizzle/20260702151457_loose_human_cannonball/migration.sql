ALTER TABLE "coffees" DROP CONSTRAINT "coffees_dialed_in_shot_id_espresso_shots_id_fkey";--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD COLUMN "roast_date" date;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD COLUMN "is_dialed_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "espresso_shots" SET "roast_date" = "coffees"."roastDate" FROM "coffees" WHERE "coffees"."id" = "espresso_shots"."coffee_id";--> statement-breakpoint
UPDATE "espresso_shots" SET "is_dialed_in" = true FROM "coffees" WHERE "coffees"."dialed_in_shot_id" = "espresso_shots"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "espresso_shots_dialed_in_idx" ON "espresso_shots" ("coffee_id") WHERE is_dialed_in;--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "roastDate";--> statement-breakpoint
ALTER TABLE "coffees" DROP COLUMN "dialed_in_shot_id";
