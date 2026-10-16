DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account" a
    JOIN "account" b
      ON a."provider_id" = b."provider_id"
     AND a."account_id" = b."account_id"
     AND a."user_id" IS DISTINCT FROM b."user_id"
  ) THEN
    RAISE EXCEPTION
      'account has the same provider_id and account_id on more than one user; resolve those rows before adding account_providerId_accountId_idx';
  END IF;
END
$$;
--> statement-breakpoint
DELETE FROM "account" a
USING "account" b
WHERE a."provider_id" = b."provider_id"
  AND a."account_id" = b."account_id"
  AND a."user_id" = b."user_id"
  AND a."id" <> b."id"
  AND (a."created_at", a."id") > (b."created_at", b."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_providerId_accountId_idx" ON "account" ("provider_id","account_id");
