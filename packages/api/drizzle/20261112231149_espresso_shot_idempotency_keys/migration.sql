CREATE TABLE "espresso_shot_idempotency_keys" (
	"user_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"shot_id" uuid,
	CONSTRAINT "espresso_shot_idempotency_keys_pkey" PRIMARY KEY("user_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "espresso_shot_idempotency_keys" ADD CONSTRAINT "espresso_shot_idempotency_keys_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "espresso_shot_idempotency_keys" ADD CONSTRAINT "espresso_shot_idempotency_keys_shot_id_espresso_shots_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "espresso_shots"("id") ON DELETE SET NULL;--> statement-breakpoint
INSERT INTO "espresso_shot_idempotency_keys" ("user_id", "idempotency_key", "shot_id")
SELECT "user_id", "idempotency_key", "id" FROM "espresso_shots" WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
DROP INDEX "espresso_shots_user_idempotency_idx";
