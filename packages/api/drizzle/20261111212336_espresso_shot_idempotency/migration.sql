ALTER TABLE "espresso_shots" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "espresso_shots_user_idempotency_idx" ON "espresso_shots" ("user_id","idempotency_key");