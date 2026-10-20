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
  "access_token" = src.access_token,
  "refresh_token" = src.refresh_token,
  "id_token" = src.id_token,
  "access_token_expires_at" = src.access_token_expires_at,
  "refresh_token_expires_at" = src.refresh_token_expires_at,
  "scope" = src.scope,
  "password" = src.password
FROM (
  SELECT DISTINCT ON ("provider_id", "account_id", "user_id")
    "provider_id",
    "account_id",
    "user_id",
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password"
  FROM "account"
  WHERE "refresh_token" IS NOT NULL OR "access_token" IS NOT NULL
  ORDER BY
    "provider_id",
    "account_id",
    "user_id",
    ("refresh_token" IS NULL),
    "updated_at" DESC,
    "created_at" DESC,
    "id" DESC
) AS src
WHERE keeper."provider_id" = src."provider_id"
  AND keeper."account_id" = src."account_id"
  AND keeper."user_id" = src."user_id"
  AND NOT EXISTS (
    SELECT 1
    FROM "account" older
    WHERE older."provider_id" = keeper."provider_id"
      AND older."account_id" = keeper."account_id"
      AND older."user_id" = keeper."user_id"
      AND (older."created_at", older."id") < (keeper."created_at", keeper."id")
  );
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
