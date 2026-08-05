CREATE TABLE "plan_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"plan_id" "plan_id" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_interests_user_plan_idx" ON "plan_interests" ("user_id","plan_id");--> statement-breakpoint
ALTER TABLE "plan_interests" ADD CONSTRAINT "plan_interests_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;