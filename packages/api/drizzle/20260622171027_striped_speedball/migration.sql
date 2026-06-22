CREATE TABLE "grinders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD COLUMN "grinder_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "grinders_user_id_index" ON "grinders" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grinders_name_user_id_index" ON "grinders" ("name","user_id");--> statement-breakpoint
ALTER TABLE "espresso_shots" ADD CONSTRAINT "espresso_shots_grinder_id_grinders_id_fkey" FOREIGN KEY ("grinder_id") REFERENCES "grinders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "grinders" ADD CONSTRAINT "grinders_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;