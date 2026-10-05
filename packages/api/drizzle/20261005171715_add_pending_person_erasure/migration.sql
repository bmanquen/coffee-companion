CREATE TABLE "pending_person_erasure" (
	"account_id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
