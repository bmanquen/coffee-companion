CREATE TABLE "espresso_shot_idempotency_keys" (
	"user_id" text,
	"idempotency_key" uuid,
	"shot_id" uuid,
	CONSTRAINT "espresso_shot_idempotency_keys_pkey" PRIMARY KEY("user_id","idempotency_key")
);
--> statement-breakpoint
DROP INDEX "espresso_shots_user_idx";--> statement-breakpoint
DROP INDEX "espresso_shots_user_coffee_idx";--> statement-breakpoint
CREATE INDEX "espresso_shot_idempotency_keys_shot_id_idx" ON "espresso_shot_idempotency_keys" ("shot_id");--> statement-breakpoint
CREATE INDEX "espresso_shots_user_created_id_idx" ON "espresso_shots" ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "espresso_shots_user_coffee_created_id_idx" ON "espresso_shots" ("user_id","coffee_id","created_at","id");--> statement-breakpoint
ALTER TABLE "espresso_shot_idempotency_keys" ADD CONSTRAINT "espresso_shot_idempotency_keys_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shot_idempotency_keys" ADD CONSTRAINT "espresso_shot_idempotency_keys_shot_id_espresso_shots_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "espresso_shots"("id") ON DELETE SET NULL;