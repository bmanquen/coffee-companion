ALTER TABLE "brewing_device_types" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "brewing_device_types" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "brewing_device_types" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brewing_devices" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "brewing_devices" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "brewing_devices" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coffee_processes" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "coffee_processes" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "coffee_processes" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coffees" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "coffees" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "coffees" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coffees_varieties" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "coffees_varieties" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "coffees_varieties" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "countries" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "espresso_shots" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "espresso_shots" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "espresso_shots" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "farms" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "green_coffees" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "green_coffees" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "green_coffees" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "green_coffees_varieties" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grinders" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "grinders" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "grinders" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "regions" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roast_levels" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "roast_levels" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "roast_levels" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roasters" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "roasters" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "roasters" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "varieties" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "varieties" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "varieties" ALTER COLUMN "updated_at" SET NOT NULL;
