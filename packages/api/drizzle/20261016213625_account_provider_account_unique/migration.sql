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
UPDATE "account" AS keeper
SET
  "refresh_token" = COALESCE(keeper."refresh_token", newer."refresh_token"),
  "access_token" = COALESCE(keeper."access_token", newer."access_token"),
  "id_token" = COALESCE(keeper."id_token", newer."id_token")
FROM "account" AS newer
WHERE keeper."provider_id" = newer."provider_id"
  AND keeper."account_id" = newer."account_id"
  AND keeper."user_id" = newer."user_id"
  AND keeper."id" <> newer."id"
  AND (keeper."created_at", keeper."id") < (newer."created_at", newer."id");
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
