ALTER TABLE "coffees" ADD COLUMN "is_blend" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coffees_user_roaster_name_idx" ON "coffees" ("user_id","roaster_id","name");