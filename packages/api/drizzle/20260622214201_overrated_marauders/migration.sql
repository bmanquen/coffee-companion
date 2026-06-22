CREATE TABLE "brewing_device_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "brewing_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"type_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "brewing_device_types_name_idx" ON "brewing_device_types" ("name");--> statement-breakpoint
-- Seed system-default brewing device types (shared across all users, NULL user_id).
INSERT INTO "brewing_device_types" ("name") VALUES
	('Espresso'),
	('Pour Over'),
	('French Press'),
	('AeroPress'),
	('Moka Pot'),
	('Drip Machine'),
	('Cold Brew'),
	('Siphon')
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
CREATE INDEX "brewing_devices_user_id_index" ON "brewing_devices" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brewing_devices_name_user_id_index" ON "brewing_devices" ("name","user_id");--> statement-breakpoint
ALTER TABLE "brewing_device_types" ADD CONSTRAINT "brewing_device_types_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "brewing_devices" ADD CONSTRAINT "brewing_devices_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "brewing_devices" ADD CONSTRAINT "brewing_devices_type_id_brewing_device_types_id_fkey" FOREIGN KEY ("type_id") REFERENCES "brewing_device_types"("id");--> statement-breakpoint
-- Add the shot -> device column nullable first so existing rows can be backfilled.
ALTER TABLE "espresso_shots" ADD COLUMN "brewing_device_id" uuid;--> statement-breakpoint
-- Backfill: give every user with existing shots a placeholder Espresso device.
INSERT INTO "brewing_devices" ("user_id", "name", "brand", "type_id")
SELECT DISTINCT es."user_id",
	'Unknown',
	'Unknown',
	(SELECT "id" FROM "brewing_device_types" WHERE "name" = 'Espresso' AND "user_id" IS NULL)
FROM "espresso_shots" es
WHERE es."brewing_device_id" IS NULL;--> statement-breakpoint
UPDATE "espresso_shots" es
SET "brewing_device_id" = bd."id"
FROM "brewing_devices" bd
WHERE bd."user_id" = es."user_id"
	AND bd."name" = 'Unknown'
	AND es."brewing_device_id" IS NULL;--> statement-breakpoint
ALTER TABLE "espresso_shots" ALTER COLUMN "brewing_device_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_brewing_device_id_brewing_devices_id_fkey" FOREIGN KEY ("brewing_device_id") REFERENCES "brewing_devices"("id") ON DELETE CASCADE;
